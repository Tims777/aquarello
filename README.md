# Aquarello

Aquarello is a photo booth app with optional support for GenAI filters. Fittingly, this app was created in Google AI Studio.

## Features

- Webcam as video source: Take photos using any locally connected camera (support for remote connections planned)
- Build around the user: Choose the best photo for download / printing or try again using the "retake" button
- Optional ComfyUI-Integration: Send photos to ComfyUI for GenAI processing
- Optional Printer-Integration: Send photos to a printer (see [printer-service](./printer-service/README.md) for more details)
- User configurable: Relevant settings can be changed on the fly in the config UI
- Modular approach: Integrations are fully optional, turn them off if something fails and keep using the core features
