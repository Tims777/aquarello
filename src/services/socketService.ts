import { useEffect, useRef, useState, useCallback } from 'react';
import { PreviewUpdate, FinalResult } from '../types';

export function useBoothSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [previews, setPreviews] = useState<PreviewUpdate[]>([]);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const transport = useRef<any>(null); // Type 'WebTransport' is relatively new, using any for broad compatibility check

  const connectTransport = useCallback(async () => {
    // Note: WebTransport requires HTTP/3 and valid certificates or specific hashes.
    // In this preview environment, it will likely fail until the Python backend is active.
    if (!('WebTransport' in window)) {
      console.warn('WebTransport is not supported in this browser.');
      return;
    }

    try {
      const url = `https://${window.location.host}/live-transport`;
      console.log('Attempting WebTransport connection to:', url);
      
      // @ts-ignore - WebTransport is global but types might be missing in some environments
      transport.current = new WebTransport(url);
      await transport.current.ready;
      
      console.log('WebTransport connected');
      
      // Start reading the unidirectional stream for video data
      const reader = transport.current.incomingUnidirectionalStreams.getReader();
      while (true) {
        const { value: stream, done } = await reader.read();
        if (done) break;
        handleIncomingStream(stream);
      }
    } catch (err) {
      console.error('WebTransport connection failed (expected in Node dev environment):', err);
    }
  }, []);

  const handleIncomingStream = async (stream: any) => {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // Dispatch the video chunk to View1
      window.dispatchEvent(new CustomEvent('video-chunk', { detail: { data: value, timestamp: Date.now(), isKey: true } }));
    }
  };

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}`);

    socket.onopen = () => {
      console.log('Connected to booth backend (Control Channel)');
      setIsConnected(true);
      // Once control is up, try to upgrade the video feed to WebTransport
      connectTransport();
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'preview':
          setPreviews((prev) => [...prev, data]);
          break;
        case 'final':
          setFinalResult({ variants: data.variants });
          break;
        case 'print-confirm':
          alert('Print command confirmed by server!');
          break;
        case 'video-chunk':
          // For WebCodecs simulation - handled in the view component
          const customEvent = new CustomEvent('video-chunk', { detail: data });
          window.dispatchEvent(customEvent);
          break;
        case 'remote-countdown':
          window.dispatchEvent(new CustomEvent('remote-countdown', { detail: data }));
          break;
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from booth backend');
      setIsConnected(false);
      // Attempt reconnect after 3s
      setTimeout(connect, 3000);
    };

    ws.current = socket;
  }, []);

  useEffect(() => {
    connect();
    return () => ws.current?.close();
  }, [connect]);

  const send = (type: string, payload: any = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, ...payload }));
    }
  };

  const setDelay = (delay: number) => send('set-delay', { delay });
  const capture = () => {
    setPreviews([]);
    setFinalResult(null);
    send('capture');
  };
  const print = (variantId: number) => send('print', { variantId });

  return {
    isConnected,
    previews,
    finalResult,
    setDelay,
    capture,
    print,
  };
}
