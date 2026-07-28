# Aquarello

Aquarello is a photo booth app with optional support for GenAI filters. It is intended for private events like weddings or birthdays and requires only minimal supervision: Guests can take photos using a self-timer button and send their favorite ones to a connected printer.

## Screenshots

<img width="2020" height="1295" alt="Screenshot of camera view" src="https://github.com/user-attachments/assets/ac06cb15-ef50-4f2d-81ed-16dd57908a6e" />
<img width="2020" height="1295" alt="Screenshot of settings view" src="https://github.com/user-attachments/assets/778c37d3-77c1-4312-9776-506bcf3fd261" />
<img width="2020" height="1295" alt="Screenshot of result view" src="https://github.com/user-attachments/assets/7ff039b3-1f82-4526-92fd-faa5c2dee3f1" />


## Features

- Easy to use: The UI is simple, self-explanatory and optimized for touchscreen input
- User-configurable: All settings can be changed on the fly in the config modal
- Modular approach: Fully optional integrations - turn them off if something fails and keep using the provided fallbacks

## Integrations
- Camera-Integration: Capture photos using a remotely connected camera (see [camera-service](./camera-service/README.md) for more details)
- ComfyUI-Integration: Send photos to ComfyUI for GenAI processing
- Printer-Integration: Send photos to a printer (see [printer-service](./printer-service/README.md) for more details)
