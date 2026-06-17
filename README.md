# Aquarello

Aquarello is a photo booth app with optional support for GenAI filters. Fittingly, this app was created in Google AI Studio.

## Screenshots

<img width="2020" height="1295" alt="Screenshot of camera view" src="https://github.com/user-attachments/assets/ac06cb15-ef50-4f2d-81ed-16dd57908a6e" />
<img width="2020" height="1295" alt="Screenshot of settings view" src="https://github.com/user-attachments/assets/778c37d3-77c1-4312-9776-506bcf3fd261" />
<img width="2020" height="1295" alt="Screenshot of result view" src="https://github.com/user-attachments/assets/7ff039b3-1f82-4526-92fd-faa5c2dee3f1" />


## Features

- Webcam as video source: Take photos using any locally connected camera (support for remote connections planned)
- Build around the user: Choose the best photo for download / printing or try again using the "retake" button
- Optional ComfyUI-Integration: Send photos to ComfyUI for GenAI processing
- Optional Printer-Integration: Send photos to a printer (see [printer-service](./printer-service/README.md) for more details)
- User configurable: Relevant settings can be changed on the fly in the config UI
- Modular approach: Integrations are fully optional, turn them off if something fails and keep using the core features
