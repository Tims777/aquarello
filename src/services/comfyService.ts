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
    
    // Auto-append /api if pathname does not end with /api
    let apiPath = cleanUrl.pathname.replace(/\/$/, '');
    if (!apiPath.endsWith('/api')) {
      apiPath = apiPath + '/api';
    }
    const baseUrl = cleanUrl.origin + apiPath;
    
    // Create WebSocket URL
    const wsProtocol = cleanUrl.protocol === 'https:' ? 'wss' : 'ws';
    const credentialsPart = credentials ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@` : '';
    const wsUrl = `${wsProtocol}://${credentialsPart}${cleanUrl.host}${apiPath}/ws`;
    
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
 * Uploads a base64 image or remote HTTP image URL to ComfyUI
 */
export async function uploadImageToComfy(
  config: ComfyConfig,
  base64Image: string,
  filename: string = 'booth_upload.jpg',
  type: 'input' | 'output' | 'temp' = 'input',
  subfolder: string = ''
): Promise<ComfyUploadResponse> {
  let blob: Blob;
  if (base64Image.startsWith('data:')) {
    blob = dataURLtoBlob(base64Image);
  } else {
    // Remote camera images are fetched directly by the browser. The camera
    // service must allow this application's origin through CORS.
    try {
      const savedApiKey = localStorage.getItem('remote_camera_api_key') || '';
      const headers: Record<string, string> = {};
      if (savedApiKey) {
        headers['Authorization'] = `Bearer ${savedApiKey}`;
      }

      console.log(`Fetching remote camera image: ${base64Image}`);
      const response = await fetch(base64Image, { headers });
      if (!response.ok) {
        throw new Error(`Remote camera image fetch failed with status ${response.status}`);
      }
      blob = await response.blob();
    } catch (err) {
      console.error(`Error downloading remote external camera image:`, err);
      throw err;
    }
  }

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
export const DEFAULT_COMFY_WORKFLOW = {};
