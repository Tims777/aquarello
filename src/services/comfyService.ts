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

/**
 * Opens a ComfyUI WebSocket and resolves only after its handshake succeeds.
 *
 * Browser WebSockets cannot attach the HTTP headers from ComfyConfig, so an
 * authenticated deployment must authenticate the upgrade with a cookie or a
 * token understood by its reverse proxy.
 */
export async function openComfyWebSocket(
  config: ComfyConfig,
  clientId: string,
  timeoutMs: number = 5000
): Promise<WebSocket> {
  const url = new URL(config.wsUrl);
  url.searchParams.set('clientId', clientId);
  const socket = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      socket.close();
      reject(new Error(`WebSocket handshake timed out after ${timeoutMs} ms: ${url}`));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('error', handleError);
      socket.removeEventListener('close', handleClose);
    };
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`WebSocket handshake failed: ${url}`));
    };
    const handleClose = (event: CloseEvent) => {
      cleanup();
      reject(
        new Error(
          `WebSocket closed during handshake (${event.code}${
            event.reason ? `: ${event.reason}` : ''
          }): ${url}`
        )
      );
    };

    socket.addEventListener('open', handleOpen, { once: true });
    socket.addEventListener('error', handleError, { once: true });
    socket.addEventListener('close', handleClose, { once: true });
  });

  return socket;
}

/**
 * Waits for ComfyUI to finish a prompt.
 *
 * A healthy socket is the primary completion signal. History is queried once
 * after that signal. Periodic history checks begin only when the socket is
 * unavailable or has been silent for long enough to be considered unhealthy.
 */
export async function waitForComfyHistory(
  config: ComfyConfig,
  promptId: string,
  socket: WebSocket | null,
  signal?: AbortSignal,
  silenceMs: number = 10_000,
  fallbackIntervalMs: number = 1500
): Promise<any> {
  let socketAvailable = socket?.readyState === WebSocket.OPEN;
  let lastSocketActivity = Date.now();
  let completionSignaled = false;
  let executionError: Error | null = null;
  let historyErrorCount = 0;
  let lastHistoryError: unknown;
  let wake: (() => void) | null = null;

  const handleMessage = (event: MessageEvent) => {
    lastSocketActivity = Date.now();
    if (typeof event.data !== 'string') return;

    try {
      const message = JSON.parse(event.data);
      const data = message?.data ?? {};
      if (data.prompt_id && data.prompt_id !== promptId) return;

      if (
        (message.type === 'executing' && data.node === null) ||
        message.type === 'execution_success'
      ) {
        completionSignaled = true;
      } else if (
        message.type === 'execution_error' ||
        message.type === 'execution_interrupted'
      ) {
        executionError = new Error(
          data.exception_message ||
            data.exception_type ||
            `ComfyUI reported ${message.type} for prompt ${promptId}`
        );
      }
      wake?.();
    } catch {
      // Ignore non-JSON text frames from extensions.
    }
  };
  const handleUnavailable = () => {
    socketAvailable = false;
    wake?.();
  };

  socket?.addEventListener('message', handleMessage);
  socket?.addEventListener('error', handleUnavailable);
  socket?.addEventListener('close', handleUnavailable);

  const pause = () =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Operation aborted', 'AbortError'));
        return;
      }

      let settled = false;
      let timer = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        wake = null;
        resolve();
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        wake = null;
        reject(new DOMException('Operation aborted', 'AbortError'));
      };

      wake = finish;
      timer = window.setTimeout(finish, fallbackIntervalMs);
      signal?.addEventListener('abort', abort, { once: true });
    });

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Operation aborted', 'AbortError');
      }
      if (executionError) throw executionError;

      const socketSilent = Date.now() - lastSocketActivity >= silenceMs;
      if (completionSignaled || !socketAvailable || socketSilent) {
        try {
          const history = await getComfyHistory(config, promptId);
          historyErrorCount = 0;
          if (history?.[promptId]) return history[promptId];
        } catch (error) {
          lastHistoryError = error;
          historyErrorCount++;
          if (historyErrorCount > 15) {
            throw new Error(
              `ComfyUI history fallback failed repeatedly for prompt ${promptId}`,
              { cause: lastHistoryError }
            );
          }
        }
      }

      await pause();
    }
  } finally {
    socket?.removeEventListener('message', handleMessage);
    socket?.removeEventListener('error', handleUnavailable);
    socket?.removeEventListener('close', handleUnavailable);
    wake?.();
  }
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
    // Browsers reject WebSocket URLs containing username/password credentials.
    // Authentication for the upgrade must be handled by a proxy cookie or token.
    const wsUrl = `${wsProtocol}://${cleanUrl.host}${apiPath}/ws`;
    
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
