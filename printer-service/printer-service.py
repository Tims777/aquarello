import io
import os
import tempfile

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from PIL import Image

from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("PRINT_API_KEY")

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


# Windows only imports
import win32print
import win32ui
from PIL import ImageWin


# CORS: Allow requests from any domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# Health
# =========================================================

@app.get("/status")
def status():
    """
    Health check.
    """
    return {"status": "ok"}


# =========================================================
# Enumerate printers
# =========================================================

@app.get("/printers")
def list_printers():
    """
    Returns installed printers.
    """

    printers = []

    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS

    for printer in win32print.EnumPrinters(flags):
        printers.append(printer[2])

    return {
        "printers": printers,
        "default": win32print.GetDefaultPrinter()
    }


# =========================================================
# Print image
# =========================================================

@app.post("/print")
async def print_image(
    printer_name: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Upload an image and print it immediately.
    """

    # Validate printer exists
    available = [
        p[2]
        for p in win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL |
            win32print.PRINTER_ENUM_CONNECTIONS
        )
    ]

    if printer_name not in available:
        raise HTTPException(
            status_code=404,
            detail="Printer not found"
        )

    # Read uploaded file
    contents = await file.read()

    try:
        image = Image.open(io.BytesIO(contents))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid image"
        )

    # Convert unsupported modes
    if image.mode != "RGB":
        image = image.convert("RGB")

    # -----------------------------------------------------
    # WINDOWS PRINTING
    # -----------------------------------------------------
    # This section WILL NOT work on Linux/macOS.
    # Requires pywin32.
    # -----------------------------------------------------

    printer_dc = win32ui.CreateDC()
    printer_dc.CreatePrinterDC(printer_name)

    printer_dc.StartDoc(file.filename or "Photo Print")
    printer_dc.StartPage()

    # Printer size
    printable_area = printer_dc.GetDeviceCaps(8), printer_dc.GetDeviceCaps(10)
    printer_size = printer_dc.GetDeviceCaps(110), printer_dc.GetDeviceCaps(111)

    # Scale image to fit printable area
    img_width, img_height = image.size

    ratio = min(
        printable_area[0] / img_width,
        printable_area[1] / img_height
    )

    scaled_width = int(img_width * ratio)
    scaled_height = int(img_height * ratio)

    x1 = int((printer_size[0] - scaled_width) / 2)
    y1 = int((printer_size[1] - scaled_height) / 2)

    dib = ImageWin.Dib(image)

    dib.draw(
        printer_dc.GetHandleOutput(),
        (x1, y1, x1 + scaled_width, y1 + scaled_height)
    )

    printer_dc.EndPage()
    printer_dc.EndDoc()
    printer_dc.DeleteDC()

    return JSONResponse({
        "success": True,
        "printer": printer_name,
        "filename": file.filename
    })
