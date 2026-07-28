# Aquarello

Aquarello is a photo booth app with optional support for GenAI filters. It is intended for private events like weddings or birthdays and requires only minimal supervision: Guests can take photos using a self-timer button and send their favorite ones to a connected printer.

## Features

- Easy to use: The UI is simple, self-explanatory and optimized for touchscreen input
- User-configurable: All settings can be changed on the fly in the config modal
- Modular approach: Integrations are fully optional - turn them off if something fails and keep using the provided fallbacks

## Integrations

- [Camera-Integration](./camera-integration/README.md): Capture photos using a remote-connected camera
- [GenAI-Integration](./genai-integration/README.md): Do GenAI-processing of photos using ComfyUI workflows
- [Printer-Integration](./printer-integration/README.md): Send photos to a remote-connected printer

## Screenshots

<img width="2020" height="1295" alt="Screenshot of camera view" src="https://github.com/user-attachments/assets/ac06cb15-ef50-4f2d-81ed-16dd57908a6e" />
<img width="2020" height="1295" alt="Screenshot of settings view" src="https://github.com/user-attachments/assets/778c37d3-77c1-4312-9776-506bcf3fd261" />
<img width="2020" height="1295" alt="Screenshot of result view" src="https://github.com/user-attachments/assets/7ff039b3-1f82-4526-92fd-faa5c2dee3f1" />
