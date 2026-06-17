/**
 * ComfyUI Client Service
 * Coordinates image uploading, workflow submission, tracking, and image retrieving
 * with support for Basic Authentication.
 */

export interface ComfyConfig {
  baseUrl: string;
  wsUrl: string;
  headers: Record<string, string>;
}

export interface ComfyUploadResponse {
  name: string;
  subfolder: string;
  type: string;
}

export interface ComfyPromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, any>;
}

// Convert dataURL to Blob
export function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Parses the user-provided backend URL and extracts basic auth credentials if present.
 */
export function parseComfyUrl(urlStr: string, apiKey?: string): ComfyConfig | null {
  if (!urlStr) return null;
  try {
    let targetUrl = urlStr.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }
    const parsed = new URL(targetUrl);
    
    // Extract credentials
    const credentials = parsed.username || parsed.password 
      ? `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`
      : null;
    
    const headers: Record<string, string> = {};
    if (credentials) {
      headers['Authorization'] = `Basic ${btoa(credentials)}`;
    }

    if (apiKey && apiKey.trim()) {
      headers['X-API-Key'] = apiKey.trim();
    }
    
    // Create clean Base URL (without credentials)
    const cleanUrl = new URL(parsed.href);
    cleanUrl.username = '';
    cleanUrl.password = '';
    const baseUrl = cleanUrl.origin + cleanUrl.pathname.replace(/\/$/, '');
    
    // Create WebSocket URL
    const wsProtocol = cleanUrl.protocol === 'https:' ? 'wss' : 'ws';
    const credentialsPart = credentials ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@` : '';
    const wsUrl = `${wsProtocol}://${credentialsPart}${cleanUrl.host}${cleanUrl.pathname.replace(/\/$/, '')}/ws`;
    
    return {
      baseUrl,
      wsUrl,
      headers
    };
  } catch (err) {
    console.error('Failed to parse ComfyUI URL:', err);
    return null;
  }
}

/**
 * Uploads a base64 image to ComfyUI
 */
export async function uploadImageToComfy(
  config: ComfyConfig,
  base64Image: string,
  filename: string = 'booth_upload.jpg',
  type: 'input' | 'output' | 'temp' = 'input',
  subfolder: string = ''
): Promise<ComfyUploadResponse> {
  const blob = dataURLtoBlob(base64Image);
  const formData = new FormData();
  formData.append('image', blob, filename);
  formData.append('overwrite', 'true');
  formData.append('subfolder', subfolder);
  formData.append('type', type);

  const response = await fetch(`${config.baseUrl}/upload/image`, {
    method: 'POST',
    headers: {
      ...config.headers,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed with status ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Queues a prompt workflow to ComfyUI
 */
export async function queuePromptToComfy(
  config: ComfyConfig,
  prompt: any,
  clientId: string
): Promise<ComfyPromptResponse> {
  const response = await fetch(`${config.baseUrl}/prompt`, {
    method: 'POST',
    headers: {
      ...config.headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      client_id: clientId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Queue prompt failed with status ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Retrieves the history output for a prompt ID
 */
export async function getComfyHistory(
  config: ComfyConfig,
  promptId: string
): Promise<any> {
  const response = await fetch(`${config.baseUrl}/history/${promptId}`, {
    method: 'GET',
    headers: {
      ...config.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Get history failed with status ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Retrieves system stats including ComfyUI version
 */
export async function getComfySystemStats(
  config: ComfyConfig
): Promise<any> {
  const response = await fetch(`${config.baseUrl}/system_stats`, {
    method: 'GET',
    headers: {
      ...config.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch system stats: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Fetches an image from view and returns a secure local Blob URL.
 * This ensures Basic Auth headers are present and images work regardless of CORS or cookie conditions.
 */
export async function fetchComfyViewUrl(
  config: ComfyConfig,
  filename: string,
  subfolder: string = '',
  type: 'input' | 'output' | 'temp' = 'output'
): Promise<string> {
  const params = new URLSearchParams({
    filename,
    subfolder,
    type,
  });

  const response = await fetch(`${config.baseUrl}/view?${params.toString()}`, {
    headers: {
      ...config.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to view image ${filename}: ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Default standard placeholder workflow for ComfyUI.
 * Users can update this layout directly in settings to match their model checkpoints or nodes!
 */
export const DEFAULT_COMFY_WORKFLOW = {
  "3": {
    "inputs": {
      "ckpt_name": "v1-5-pruned-emaonly.safetensors"
    },
    "class_type": "CheckpointLoaderSimple",
    "_meta": { "title": "Load Checkpoint" }
  },
  "4": {
    "inputs": {
      "text": "photorealistic portrait, high quality, masterpiece, beautiful colors",
      "clip": ["3", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Positive Prompt" }
  },
  "5": {
    "inputs": {
      "text": "blurry, low quality, bad anatomy, distorted, monochrome",
      "clip": ["3", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Negative Prompt" }
  },
  "6": {
    "inputs": {
      "image": "REPLACE_IMAGE_NAME",
      "upload": "image"
    },
    "class_type": "LoadImage",
    "_meta": { "title": "Load Image" }
  },
  "7": {
    "inputs": {
      "pixels": ["6", 0],
      "vae": ["3", 2]
    },
    "class_type": "VAEEncode",
    "_meta": { "title": "VAE Encode" }
  },
  "8": {
    "inputs": {
      "seed": 42,
      "steps": 20,
      "cfg": 7,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 0.5,
      "model": ["3", 0],
      "positive": ["4", 0],
      "negative": ["5", 0],
      "latent_image": ["7", 0]
    },
    "class_type": "KSampler",
    "_meta": { "title": "KSampler" }
  },
  "9": {
    "inputs": {
      "samples": ["8", 0],
      "vae": ["3", 2]
    },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "10": {
    "inputs": {
      "filename_prefix": "comfy_booth",
      "images": ["9", 0]
    },
    "class_type": "SaveImage",
    "_meta": { "title": "Save Output Image" }
  }
};
