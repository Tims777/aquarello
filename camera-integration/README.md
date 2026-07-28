# Aquarello Camera Integration

This is a lightweight implementation of a remote camera service.

## Start

Install the requirements, then start the service using the FastAPI CLI:

```
fastapi run service.py
```

The first camera is used by default. Set `CAMERA_INDEX` to select another
device, and optionally set `CAMERA_API_KEY` to require bearer authentication.

## Features

- Connect and disconnect an OpenCV-compatible camera
- Capture single photos or short bursts
- Stream a live preview
- Optional token-based authentication
