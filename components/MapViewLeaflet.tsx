import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

export interface MapViewLeafletHandle {
  postMessage: (data: string) => void;
}

interface Props {
  html: string;
  onMessage: (data: string) => void;
  style?: StyleProp<ViewStyle>;
}

const MapViewLeaflet = forwardRef<MapViewLeafletHandle, Props>(
  ({ html, onMessage, style }, ref) => {
    const webViewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      postMessage: (data: string) => {
        webViewRef.current?.postMessage(data);
      },
    }));

    return (
      <WebView
        ref={webViewRef}
        style={style}
        source={{ html }}
        onMessage={(event) => onMessage(event.nativeEvent.data)}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />
    );
  }
);

export default MapViewLeaflet;
