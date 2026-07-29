import io
import os

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from dotenv import load_dotenv

import pywintypes
import win32con
import win32gui
import win32print
import win32ui
from PIL import ImageWin

load_dotenv()

API_KEY = os.getenv("PRINT_API_KEY")
PRINTER_ENUM_FLAGS = (
    win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
)
PRINTER_NAME_INDEX = 2
PRINTER_INFO_LEVEL = 2
HORZRES = 8
VERTRES = 10

if not API_KEY:
    import logging
    logger = logging.getLogger(__name__)
    logger.warning("""
        ###########################################################################
        # PRINT_API_KEY environment variable is not set, API will be unprotected! #
        ###########################################################################
    """)


def require_api_key(x_api_key: str = Header(None)):
    """
    Check for matching X-API-Key iff PRINT_API_KEY is configured.
    """
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )


app = FastAPI(
    dependencies=[Depends(require_api_key)]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/status")
def status():
    """
    Health check.
    """
    return {"status": "ok"}


@app.get("/printers")
def list_printers():
    """
    Returns installed printers.
    """

    return {
        "printers": _get_printer_names(),
        "default": win32print.GetDefaultPrinter()
    }


@app.get("/printers/{printer_name}/options")
def printer_options(printer_name: str):
    if printer_name not in _get_printer_names():
        raise HTTPException(status_code=404, detail="Printer not found")
    return _get_printer_options(printer_name)


@app.post("/print")
async def print_image(
    printer_name: str = Form(...),
    file: UploadFile = File(...),
    paper_size: int | None = Form(None),
    media_type: int | None = Form(None),
    x_dpi: int | None = Form(None),
    y_dpi: int | None = Form(None),
):
    """
    Upload an image and print it immediately.
    """

    if printer_name not in _get_printer_names():
        raise HTTPException(
            status_code=404,
            detail="Printer not found"
        )

    contents = await file.read()

    try:
        image = Image.open(io.BytesIO(contents))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid image"
        )

    if image.mode != "RGB":
        image = image.convert("RGB")

    printer_dc = _create_printer_dc(
        printer_name,
        paper_size,
        media_type,
        x_dpi,
        y_dpi,
    )

    printer_dc.StartDoc(file.filename or "Photo Print")
    printer_dc.StartPage()

    image, destination = _fit_image_to_printer(image, printer_dc)
    dib = ImageWin.Dib(image)

    dib.draw(
        printer_dc.GetHandleOutput(),
        destination
    )

    printer_dc.EndPage()
    printer_dc.EndDoc()
    printer_dc.DeleteDC()

    return JSONResponse({
        "success": True,
        "printer": printer_name,
        "filename": file.filename
    })


def _get_printer_names():
    return [
        printer[PRINTER_NAME_INDEX]
        for printer in win32print.EnumPrinters(PRINTER_ENUM_FLAGS)
    ]


def _get_printer_options(printer_name):
    printer = win32print.OpenPrinter(printer_name)
    try:
        info = win32print.GetPrinter(printer, PRINTER_INFO_LEVEL)
    finally:
        win32print.ClosePrinter(printer)

    port = info["pPortName"]
    devmode = info["pDevMode"]
    paper_ids = _get_capability(printer_name, port, win32con.DC_PAPERS, devmode)
    paper_names = _get_capability(
        printer_name, port, win32con.DC_PAPERNAMES, devmode
    )
    paper_dimensions = _get_capability(
        printer_name, port, win32con.DC_PAPERSIZE, devmode
    )
    media_ids = _get_capability(
        printer_name, port, win32con.DC_MEDIATYPES, devmode
    )
    media_names = _get_capability(
        printer_name, port, win32con.DC_MEDIATYPENAMES, devmode
    )
    resolutions = _get_capability(
        printer_name, port, win32con.DC_ENUMRESOLUTIONS, devmode
    )

    return {
        "paper_sizes": [
            {
                "id": paper_id,
                "name": name,
                "width_tenth_mm": dimensions["x"],
                "height_tenth_mm": dimensions["y"],
            }
            for paper_id, name, dimensions in zip(
                paper_ids, paper_names, paper_dimensions
            )
        ],
        "media_types": [
            {"id": media_id, "name": name}
            for media_id, name in zip(media_ids, media_names)
        ],
        "resolutions": [
            {"x_dpi": resolution["xdpi"], "y_dpi": resolution["ydpi"]}
            for resolution in resolutions
        ],
    }


def _get_capability(printer_name, port, capability, devmode):
    try:
        result = win32print.DeviceCapabilities(
            printer_name, port, capability, devmode
        )
    except pywintypes.error:
        return ()
    return result if isinstance(result, (list, tuple)) else ()


def _create_printer_dc(
    printer_name,
    paper_size=None,
    media_type=None,
    x_dpi=None,
    y_dpi=None,
):
    if all(value is None for value in (paper_size, media_type, x_dpi, y_dpi)):
        printer_dc = win32ui.CreateDC()
        printer_dc.CreatePrinterDC(printer_name)
        return printer_dc

    options = _get_printer_options(printer_name)
    if paper_size is not None and paper_size not in {
        option["id"] for option in options["paper_sizes"]
    }:
        raise HTTPException(status_code=422, detail="Unsupported paper size")
    if media_type is not None and media_type not in {
        option["id"] for option in options["media_types"]
    }:
        raise HTTPException(status_code=422, detail="Unsupported media type")
    if (x_dpi is None) != (y_dpi is None):
        raise HTTPException(
            status_code=422,
            detail="x_dpi and y_dpi must be specified together",
        )
    if x_dpi is not None and {
        "x_dpi": x_dpi,
        "y_dpi": y_dpi,
    } not in options["resolutions"]:
        raise HTTPException(status_code=422, detail="Unsupported resolution")

    printer = win32print.OpenPrinter(printer_name)
    try:
        info = win32print.GetPrinter(printer, PRINTER_INFO_LEVEL)
        devmode = info["pDevMode"]
        if paper_size is not None:
            devmode.PaperSize = paper_size
            devmode.Fields |= win32con.DM_PAPERSIZE
        if media_type is not None:
            devmode.MediaType = media_type
            devmode.Fields |= win32con.DM_MEDIATYPE
        if x_dpi is not None:
            devmode.PrintQuality = x_dpi
            devmode.YResolution = y_dpi
            devmode.Fields |= win32con.DM_PRINTQUALITY | win32con.DM_YRESOLUTION

        if win32print.DocumentProperties(
            0,
            printer,
            printer_name,
            devmode,
            devmode,
            win32con.DM_IN_BUFFER | win32con.DM_OUT_BUFFER,
        ) != win32con.IDOK:
            raise HTTPException(
                status_code=422,
                detail="Printer rejected the selected options",
            )

        handle = win32gui.CreateDC(
            info["pDriverName"],
            printer_name,
            devmode,
        )
        return win32ui.CreateDCFromHandle(handle)
    finally:
        win32print.ClosePrinter(printer)


def _fit_image_to_printer(image, printer_dc):
    printable_area = (
        printer_dc.GetDeviceCaps(HORZRES),
        printer_dc.GetDeviceCaps(VERTRES),
    )
    img_width, img_height = image.size
    ratio = min(
        printable_area[0] / img_width,
        printable_area[1] / img_height
    )

    rotated_ratio = min(printable_area[0] / img_height, printable_area[1] / img_width)
    if rotated_ratio > ratio:
        image = image.transpose(Image.Transpose.ROTATE_90)
        img_width, img_height, ratio = img_height, img_width, rotated_ratio

    scaled_width = int(img_width * ratio)
    scaled_height = int(img_height * ratio)
    x1 = (printable_area[0] - scaled_width) // 2
    y1 = (printable_area[1] - scaled_height) // 2

    return image, (x1, y1, x1 + scaled_width, y1 + scaled_height)
