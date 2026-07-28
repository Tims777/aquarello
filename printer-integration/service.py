import io
import os

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from dotenv import load_dotenv

import win32print
import win32ui
from PIL import ImageWin

load_dotenv()

API_KEY = os.getenv("PRINT_API_KEY")
PRINTER_ENUM_FLAGS = (
    win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
)
PRINTER_NAME_INDEX = 2
HORZRES = 8
VERTRES = 10
PHYSICALWIDTH = 110
PHYSICALHEIGHT = 111

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


@app.post("/print")
async def print_image(
    printer_name: str = Form(...),
    file: UploadFile = File(...)
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

    printer_dc = win32ui.CreateDC()
    printer_dc.CreatePrinterDC(printer_name)

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


def _fit_image_to_printer(image, printer_dc):
    printable_area = (
        printer_dc.GetDeviceCaps(HORZRES),
        printer_dc.GetDeviceCaps(VERTRES),
    )
    printer_size = (
        printer_dc.GetDeviceCaps(PHYSICALWIDTH),
        printer_dc.GetDeviceCaps(PHYSICALHEIGHT),
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
    x1 = int((printer_size[0] - scaled_width) / 2)
    y1 = int((printer_size[1] - scaled_height) / 2)

    return image, (x1, y1, x1 + scaled_width, y1 + scaled_height)
