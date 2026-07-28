# Aquarello Printer Integration

This is a lightweight implementation of a printer service. The main advantage of
this service is browser-independent
[silent printing](https://chromeenterprise.google/intl/en_us/policies/silent-printing-enabled/).
Additionally, the service can run on a different device in the same network,
thus creating additional flexibility in the photo booth setup.

## Start

If you are in a publicly accessible network, it is recommended to enable
authentication by configuring a `PRINT_API_KEY`, e.g. using a `.env` file. Make sure to that all
requirements in `requirements.txt` are installed. Afterwards, start the service
using the FastAPI CLI:

```
fastapi run service.py
```

## Features

- Query connected printers
- Schedule photos for printing
- Automatic rotation of photos to fit printable area
- Optional token-based authentication

## Limitations

- Only works on Windows
- No support for multiple users / tokens
