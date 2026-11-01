import React, { useMemo } from "react";
import { WebView } from "react-native-webview";
// OpenStreetMap pilot: no Google billing/key required. Attribution stays visible.
export default function ShopMap({
  shops,
  location,
  onSelect,
  onMove,
  userLocation,
}: any) {
  const deviceLocation = JSON.stringify(userLocation || null);
  const data = JSON.stringify(
    shops.map((s: any) => ({
      id: s.id,
      name: s.name,
      category: s.category?.name || "",
      lat: s.latitude,
      lng: s.longitude,
    })),
  ).replaceAll("<", "\\u003c");
  const html = useMemo(
    () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0}button{min-height:44px;background:#FFC400;color:#1F2937;border:0;border-radius:8px;padding:10px}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
 const map=L.map('map').setView([${Number(location.lat)},${Number(location.lng)}],14);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
 const send=value=>window.ReactNativeWebView.postMessage(JSON.stringify(value));
 const deviceLocation=${deviceLocation};if(deviceLocation)L.circleMarker([deviceLocation.lat,deviceLocation.lng],{radius:8,color:'#1D4ED8',fillColor:'#60A5FA',fillOpacity:1}).bindPopup('Your last requested device location').addTo(map);
 for(const shop of ${data}){const button=document.createElement('button');button.textContent=shop.name+' · '+shop.category+' → Open shop';button.onclick=()=>send({type:'shop',id:shop.id});L.circleMarker([shop.lat,shop.lng],{radius:10,color:'#1F2937',fillColor:'#FFC400',fillOpacity:1}).bindPopup(button).addTo(map);}
 map.on('moveend',()=>{const p=map.getCenter();send({type:'move',lat:p.lat,lng:p.lng});});
 </script></body></html>`,
    [data, location.lat, location.lng, deviceLocation],
  );
  return (
    <WebView
      style={{ height: 360, flex: 0, borderRadius: 18 }}
      source={{ html }}
      originWhitelist={["about:blank"]}
      javaScriptEnabled
      onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}
      onMessage={(event) => {
        try {
          const value = JSON.parse(event.nativeEvent.data);
          if (value.type === "shop") {
            const shop = shops.find((s: any) => s.id === value.id);
            if (shop) onSelect(shop);
          } else if (
            value.type === "move" &&
            Number.isFinite(value.lat) &&
            Number.isFinite(value.lng) &&
            Math.abs(value.lat) <= 85 &&
            Math.abs(value.lng) <= 180
          )
            onMove({ lat: value.lat, lng: value.lng });
        } catch {
          /* Ignore malformed messages. */
        }
      }}
    />
  );
}
