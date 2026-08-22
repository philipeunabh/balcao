import { NextRequest } from "next/server";
import { getMapConfiguration } from "../../../../db/google-maps";

function numberParam(request: NextRequest, key: string) {
  const value = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const latitude = numberParam(request, "lat"); const longitude = numberParam(request, "lng");
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return new Response("Localização inválida.", { status: 400 });
  const configuration = await getMapConfiguration();
  if (!configuration.selectedKey) return new Response(`${configuration.provider === "mapbox" ? "Mapbox" : "Google Maps"} não configurado.`, { status: 503 });
  const label = (request.nextUrl.searchParams.get("label") || "Belo Horizonte, MG").slice(0, 160);
  if (configuration.provider === "mapbox") {
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet"><link href="https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css" rel="stylesheet"><style>html,body,#map{width:100%;height:100%;margin:0}body{font-family:Poppins,sans-serif}.mapboxgl-popup-content{font-weight:700;padding:9px 12px}</style></head><body><div id="map" aria-label="Mapa do anúncio"></div><script src="https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.js"></script><script>mapboxgl.accessToken=${JSON.stringify(configuration.mapboxToken)};const point=[${longitude},${latitude}];const map=new mapboxgl.Map({container:"map",style:"mapbox://styles/mapbox/streets-v12",center:point,zoom:14});map.addControl(new mapboxgl.NavigationControl(),"top-right");new mapboxgl.Marker({color:"#ed111a"}).setLngLat(point).setPopup(new mapboxgl.Popup({offset:24}).setText(${JSON.stringify(label)})).addTo(map);</script></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline' https://api.mapbox.com; style-src 'unsafe-inline' https://api.mapbox.com; img-src data: blob: https://api.mapbox.com; connect-src https://api.mapbox.com https://events.mapbox.com; worker-src blob:; child-src blob:; font-src data: https://api.mapbox.com" } });
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet"><style>html,body,#map{width:100%;height:100%;margin:0}body{font-family:Poppins,sans-serif}.label{padding:8px 10px;font-weight:700}</style></head><body><div id="map" aria-label="Mapa do anúncio"></div><script>function initMap(){const point={lat:${latitude},lng:${longitude}};const map=new google.maps.Map(document.getElementById("map"),{center:point,zoom:14,mapTypeControl:false,streetViewControl:true,fullscreenControl:true});new google.maps.Marker({position:point,map,title:${JSON.stringify(label)}});}</script><script async defer src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(configuration.googleKey)}&callback=initMap&language=pt-BR&region=BR"></script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com; style-src 'unsafe-inline'; img-src data: https://maps.googleapis.com https://maps.gstatic.com https://*.googleusercontent.com; connect-src https://maps.googleapis.com https://maps.gstatic.com; font-src https://fonts.gstatic.com" } });
}
