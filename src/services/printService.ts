import { dataURLtoBlob } from './comfyService';

export interface PrinterConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

/**
 * Parses the user-provided printer backend URL and configures authorization keys if present.
 */
export function parsePrinterUrl(urlStr: string, apiKey?: string): PrinterConfig | null {
  if (!urlStr) return null;
  try {
    let targetUrl = urlStr.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }
    const parsed = new URL(targetUrl);
    
    const headers: Record<string, string> = {};
    if (apiKey && apiKey.trim()) {
      headers['X-API-Key'] = apiKey.trim();
      // Also provide Bearer token fallback just in case
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    
    // Create clean Base URL (without credentials)
    const cleanUrl = new URL(parsed.href);
    cleanUrl.username = '';
    cleanUrl.password = '';
    const baseUrl = cleanUrl.origin + cleanUrl.pathname.replace(/\/$/, '');
    
    return {
      baseUrl,
      headers
    };
  } catch (err) {
    console.error('Failed to parse Printer URL:', err);
    return null;
  }
}

/**
 * Lists installed printers
 */
export async function listPrinters(config: PrinterConfig): Promise<string[]> {
  const response = await fetch(`${config.baseUrl}/printers`, {
    method: 'GET',
    headers: {
      ...config.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list printers status ${response.status}: ${text}`);
  }

  const data = await response.json();
  // Ensure we extract array of printer names nicely
  // If data is an array directly, or holds printers in a keys/object format:
  if (Array.isArray(data)) {
    return data;
  } else if (data && typeof data === 'object') {
    // If it's an object with a list or printers key, or keys representing list
    if (Array.isArray(data.printers)) {
      return data.printers;
    }
    if (Array.isArray(data.detail)) {
      throw new Error(`Validation response: ${JSON.stringify(data.detail)}`);
    }
    return Object.keys(data);
  }
  return [];
}

/**
 * Transmits printed capture to the physical device
 */
export async function printImage(
  config: PrinterConfig,
  printerName: string,
  targetImage: string
): Promise<any> {
  let blob: Blob;
  if (targetImage.startsWith('data:')) {
    blob = dataURLtoBlob(targetImage);
  } else {
    const response = await fetch(targetImage);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${response.status} ${response.statusText}`);
    }
    blob = await response.blob();
  }
  const formData = new FormData();
  formData.append('printer_name', printerName);
  // Add file parameter as an octet-stream stream file
  formData.append('file', blob, 'booth_print.jpg');

  const response = await fetch(`${config.baseUrl}/print`, {
    method: 'POST',
    headers: {
      ...config.headers,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Print image submission failed with status ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Query active hardware status
 */
export async function queryPrinterStatus(config: PrinterConfig): Promise<any> {
  const response = await fetch(`${config.baseUrl}/status`, {
    method: 'GET',
    headers: {
      ...config.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Printer status query failed: ${response.status} ${text}`);
  }

  return response.json();
}
