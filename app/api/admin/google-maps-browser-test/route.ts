import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPrivateSetting } from "../../../../db/settings";

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return new Response("Acesso não autorizado.", { status: 401 });
  const apiKey = await readPrivateSetting("google_maps_api");
  if (!apiKey) return new Response("Google Maps não configurado.", { status: 503 });

  const scriptUrl = new URL("https://maps.googleapis.com/maps/api/js");
  scriptUrl.searchParams.set("key", apiKey);
  scriptUrl.searchParams.set("v", "weekly");
  scriptUrl.searchParams.set("libraries", "places");
  scriptUrl.searchParams.set("language", "pt-BR");
  scriptUrl.searchParams.set("region", "BR");
  scriptUrl.searchParams.set("loading", "async");
  scriptUrl.searchParams.set("callback", "runGoogleMapsTest");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body,#map{width:100%;height:100%;margin:0}</style></head><body><div id="map"></div><script>
  let completed=false;
  const services={};
  function finish(extra={}){
    if(completed)return;
    completed=true;
    const ok=Object.values(services).length===3&&Object.values(services).every((item)=>item.ok);
    parent.postMessage({source:"balcao-google-maps-test",ok,services,...extra},location.origin);
  }
  window.gm_authFailure=function(){
    services.mapsJavascript={ok:false,message:"A chave foi rejeitada pela Maps JavaScript API para este domínio."};
    services.places={ok:false,message:"Places não testada porque a chave foi rejeitada."};
    services.geocoding={ok:false,message:"Geocodificação não testada porque a chave foi rejeitada."};
    finish();
  };
  window.runGoogleMapsTest=async function(){
    try{
      const mapsLibrary=typeof google.maps.importLibrary==="function"?await google.maps.importLibrary("maps"):google.maps;
      const MapConstructor=mapsLibrary.Map||google.maps.Map;
      new MapConstructor(document.getElementById("map"),{center:{lat:-19.9166813,lng:-43.9344931},zoom:13,mapTypeControl:false});
      services.mapsJavascript={ok:true,message:"Maps JavaScript API autorizada para este domínio."};
    }catch(error){services.mapsJavascript={ok:false,message:"Não foi possível inicializar a Maps JavaScript API neste domínio."};}
    try{
      const placesLibrary=typeof google.maps.importLibrary==="function"?await google.maps.importLibrary("places"):google.maps.places;
      const token=new placesLibrary.AutocompleteSessionToken();
      let valid=false;
      if(placesLibrary.AutocompleteSuggestion){
        const response=await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({input:"Praça Sete, Belo Horizonte",includedRegionCodes:["br"],language:"pt-BR",region:"br",origin:{lat:-19.9166813,lng:-43.9344931},sessionToken:token});
        valid=Array.isArray(response.suggestions)&&response.suggestions.length>0;
      }else if(placesLibrary.AutocompleteService){
        const predictions=await new Promise((resolve,reject)=>new placesLibrary.AutocompleteService().getPlacePredictions({input:"Praça Sete, Belo Horizonte",componentRestrictions:{country:"br"},language:"pt-BR",region:"br",sessionToken:token},(items,status)=>status==="OK"?resolve(items||[]):status==="ZERO_RESULTS"?resolve([]):reject(new Error(status))));
        valid=Array.isArray(predictions)&&predictions.length>0;
      }else throw new Error("Places indisponível");
      services.places={ok:valid,message:valid?"Places API e autocomplete operacionais.":"Places API respondeu sem sugestões para o endereço de teste."};
    }catch(error){services.places={ok:false,message:"Places API não autorizada. Ative Places API (New) nas restrições da chave."};}
    try{
      const geocodingLibrary=typeof google.maps.importLibrary==="function"?await google.maps.importLibrary("geocoding"):google.maps;
      const geocoder=new (geocodingLibrary.Geocoder||google.maps.Geocoder)();
      const response=await geocoder.geocode({address:"Belo Horizonte, Minas Gerais, Brasil",region:"BR",language:"pt-BR"});
      const result=response.results&&response.results[0];
      const latitude=result&&result.geometry.location.lat();
      const longitude=result&&result.geometry.location.lng();
      const valid=Number.isFinite(latitude)&&Number.isFinite(longitude);
      services.geocoding={ok:valid,message:valid?"Pesquisa de endereço e coordenadas operacionais.":"A pesquisa não retornou coordenadas."};
      finish(valid?{defaultLocation:{label:result.formatted_address||"Belo Horizonte, MG",latitude,longitude,source:"google-maps-javascript"}}:{});
    }catch(error){services.geocoding={ok:false,message:"Geocoding não autorizado pela chave ou indisponível."};finish();}
  };
  setTimeout(()=>{if(!completed){services.mapsJavascript=services.mapsJavascript||{ok:false,message:"Tempo excedido ao carregar a Maps JavaScript API."};services.places=services.places||{ok:false,message:"Places não pôde ser testada."};services.geocoding=services.geocoding||{ok:false,message:"Geocodificação não pôde ser testada."};finish();}},15000);
  </script><script async src="${scriptUrl.toString()}"></script></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com; style-src 'unsafe-inline'; img-src data: https://maps.googleapis.com https://maps.gstatic.com https://*.googleusercontent.com; connect-src https://maps.googleapis.com https://maps.gstatic.com https://places.googleapis.com; font-src https://fonts.gstatic.com",
    },
  });
}
