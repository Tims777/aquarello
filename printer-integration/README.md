# Aquarello Printer Integration

This is a lightweight implementation of a printer service so that photos can be printed from another device on the same network. It also offers a browser-independent solution for [silent printing](https://chromeenterprise.google/intl/en_us/policies/silent-printing-enabled/).

## Start

With the dependencies installed, start the service from this directory:

```
fastapi run service.py
```

## Features

- Query connected printers
- Schedule a photo for printing
- Token-based authentication (optional)
- Based on FastAPI

## Limitations

- Only works on Windows
- No support for multiple users / tokens
