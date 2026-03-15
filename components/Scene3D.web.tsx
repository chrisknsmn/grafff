import React, { forwardRef, useImperativeHandle, useRef } from "react";

export interface Scene3DHandle {
  postMessage: (data: string) => void;
}

interface Props {
  html: string;
  onMessage: (data: string) => void;
  style?: any;
}

const Scene3D = forwardRef<Scene3DHandle, Props>(
  ({ html, onMessage, style }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useImperativeHandle(ref, () => ({
      postMessage: (data: string) => {
        iframeRef.current?.contentWindow?.postMessage(data, "*");
      },
    }));

    React.useEffect(() => {
      const handler = (e: MessageEvent) => {
        if (typeof e.data === "string") {
          onMessage(e.data);
        }
      };
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    }, [onMessage]);

    return (
      <iframe
        ref={iframeRef}
        style={{ border: "none", width: "100%", height: "100%", ...style }}
        srcDoc={html}
      />
    );
  }
);

export default Scene3D;
