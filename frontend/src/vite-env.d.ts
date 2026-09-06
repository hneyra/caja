/// <reference types="vite/client" />
/*
 * Sin esto, `import "@/ds/global.css"` no compila: TypeScript no sabe que un `.css`
 * es un modulo importable, y `yarn typecheck` —la etapa de la cadena que en #3 fue la
 * unica que vio el problema de las dos copias de Vite— moriria con TS2307.
 */
