import React, { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
export default function ShopMap({
  shops,
  location,
  onSelect,
  onMove,
  userLocation,
}: any) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onSelect, onMove });
  callbacks.current = { onSelect, onMove };
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current).setView(
      [location.lat, location.lng],
      14,
    );
    map.current = instance;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    instance.on("moveend", () => {
      const center = instance.getCenter();
      callbacks.current.onMove({ lat: center.lat, lng: center.lng });
    });
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (
      instance &&
      instance.getCenter().distanceTo([location.lat, location.lng]) > 10
    )
      instance.setView([location.lat, location.lng]);
  }, [location.lat, location.lng]);
  useEffect(() => {
    markers.current?.clearLayers();
    if (userLocation)
      L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        color: "#1D4ED8",
        fillColor: "#60A5FA",
        fillOpacity: 1,
      })
        .bindPopup("Your last requested device location")
        .addTo(markers.current!);
    for (const shop of shops) {
      const preview = document.createElement("button");
      preview.textContent =
        shop.name + " · " + (shop.category?.name || "Shop") + " → Open shop";
      preview.style.minHeight = "44px";
      preview.onclick = () => callbacks.current.onSelect(shop);
      L.circleMarker([shop.latitude, shop.longitude], {
        radius: 10,
        color: "#1F2937",
        fillColor: "#FFC400",
        fillOpacity: 1,
      })
        .bindPopup(preview)
        .addTo(markers.current!);
    }
  }, [shops, userLocation]);
  return (
    <div
      ref={container}
      role="region"
      aria-label="Nearby shops map; OpenStreetMap"
      style={{ height: 360, width: "100%", borderRadius: 18, zIndex: 0 }}
    />
  );
}
