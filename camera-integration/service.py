import os
import threading
import time
from collections import OrderedDict
from datetime import datetime
from uuid import uuid4

import cv2
from dotenv import load_dotenv
from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

API_KEY = os.getenv("CAMERA_API_KEY")
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
JPEG_QUALITY = 95
MAX_CAPTURES = 100

camera = None
camera_lock = threading.Lock()
captures = OrderedDict()
evf_running = False

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
    if not _is_authorized(x_api_key, API_KEY):
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )


app = FastAPI(dependencies=[Depends(require_api_key)])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status")
def status():
    return _status()


@app.post("/api/connect")
def connect():
    global camera

    with camera_lock:
        if camera is None or not camera.isOpened():
            camera = cv2.VideoCapture(CAMERA_INDEX)
        if not camera.isOpened():
            camera.release()
            camera = None
            raise HTTPException(status_code=503, detail="No camera available")

    return {"success": True, "status": _status()}


@app.post("/api/disconnect")
def disconnect():
    global camera, evf_running

    evf_running = False
    with camera_lock:
        if camera is not None:
            camera.release()
            camera = None

    return {"success": True}


@app.post("/api/capture")
def capture(
    count: int = Query(1, ge=1, le=10),
    interval_ms: int = Query(500, alias="intervalMs", ge=0, le=10_000),
    auto_focus: bool = Query(True, alias="autoFocus"),
):
    results = []
    for index in range(count):
        if auto_focus:
            _autofocus()
        results.append(_capture())
        if index < count - 1:
            time.sleep(interval_ms / 1000)

    return results[0] if count == 1 else {"captures": results}


@app.get("/api/captures/{capture_id}.jpg")
def get_capture(capture_id: str):
    capture = captures.get(capture_id)
    if capture is None:
        raise HTTPException(status_code=404, detail="Capture not found")

    file_name, image = capture
    return Response(
        content=image,
        media_type="image/jpeg",
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )


@app.post("/api/evf/start")
def start_evf():
    global evf_running
    _read_frame()
    evf_running = True
    return {"success": True}


@app.post("/api/evf/stop")
def stop_evf():
    global evf_running
    evf_running = False
    return {"success": True}


@app.get("/api/evf/stream")
def stream_evf():
    if not evf_running:
        raise HTTPException(status_code=409, detail="Live preview is not running")
    return StreamingResponse(
        _stream_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.post("/api/evf/af-center")
def autofocus():
    _autofocus()
    return {"success": True}


def _is_authorized(authorization=None, api_key=None):
    return not API_KEY or authorization == f"Bearer {API_KEY}" or api_key == API_KEY


def _status():
    connected = camera is not None and camera.isOpened()
    return {
        "connected": connected,
        "model": f"Camera {CAMERA_INDEX}" if connected else "No camera",
    }


def _autofocus():
    with camera_lock:
        if camera is None or not camera.isOpened():
            raise HTTPException(status_code=409, detail="Camera is not connected")
        camera.set(cv2.CAP_PROP_AUTOFOCUS, 1)


def _read_frame():
    with camera_lock:
        if camera is None or not camera.isOpened():
            raise HTTPException(status_code=409, detail="Camera is not connected")
        success, frame = camera.read()

    if not success:
        raise HTTPException(status_code=503, detail="Could not read camera frame")
    return frame


def _encode_frame(frame):
    success, encoded = cv2.imencode(
        ".jpg",
        frame,
        [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY],
    )
    if not success:
        raise HTTPException(status_code=500, detail="Could not encode camera frame")
    return encoded.tobytes()


def _capture():
    image = _encode_frame(_read_frame())
    capture_id = uuid4().hex
    file_name = f"capture-{datetime.now():%Y%m%d-%H%M%S-%f}.jpg"
    captures[capture_id] = (file_name, image)

    while len(captures) > MAX_CAPTURES:
        captures.popitem(last=False)

    return {
        "id": capture_id,
        "url": f"/api/captures/{capture_id}.jpg",
        "fileName": file_name,
    }


def _stream_frames():
    while evf_running:
        try:
            image = _encode_frame(_read_frame())
        except HTTPException:
            break

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + image
            + b"\r\n"
        )
        time.sleep(0.05)
