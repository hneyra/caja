// Viola: esta interfaz no habla con nadie.
//
// Mientras `caja-web` no tenga backend, una petición suelta dentro de una pantalla es la que
// nadie decidió y la que nadie recuerda. Los datos salen de `src/datos/`.
export async function traerRecibos() {
  const respuesta = await fetch("/api/v1/caja/recibos");
  return respuesta.json();
}

export function alaAntigua() {
  const peticion = new XMLHttpRequest();
  peticion.open("GET", "/api/v1/caja/recibos");
  peticion.send();
  return peticion;
}
