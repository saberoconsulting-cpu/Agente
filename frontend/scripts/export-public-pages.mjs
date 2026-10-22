import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const source=new URL('../src/content/',import.meta.url);
const data=JSON.parse(await readFile(new URL('legal.json',source),'utf8'));
const css=await readFile(new URL('legal.css',source),'utf8');
const output=new URL('../../platform/generated/public-pages/',import.meta.url);await mkdir(output,{recursive:true});
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const nav='<a href="/about">La aplicación</a><a href="/privacy">Privacidad</a><a href="/terms">Términos</a><a href="/">Acceder</a>';
for(const [key,page] of Object.entries(data.pages)) {
  const sections=page.sections.map(section=>`<section id="${escape(section.id)}"><h2>${escape(section.title)}</h2>${section.paragraphs.map(paragraph=>`<p>${escape(paragraph)}</p>`).join('')}</section>`).join('');
  const references=key==='privacy'?'<p>Referencias: <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a> · <a href="https://myaccount.google.com/connections">Administrar conexiones de Google</a> · <a href="https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html">Privacidad de DeepSeek</a>.</p>':'';
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title)} | ${escape(data.brand)}</title><meta name="description" content="${escape(page.summary)}"><link rel="canonical" href="https://agente.saberoconsulting.com/${key}"><style>body{margin:0}${css}</style></head><body class="public-site"><header><div class="public-wrap public-header"><a class="public-brand" href="/about">${escape(data.brand)}</a><nav aria-label="Información pública">${nav}</nav></div></header><main class="public-wrap"><article><p class="public-eyebrow">${key==='about'?'Agente comercial para empresas':'Información del servicio'}</p><h1>${escape(page.title)}</h1><p class="public-summary">${escape(page.summary)}</p><p class="public-date">${escape(data.operator)} · Actualizado: ${escape(data.updated)}</p>${sections}${references}<a class="public-action" href="/">Ir a la aplicación</a></article></main><footer><div class="public-wrap"><div class="public-footer-links">${nav}</div><p>${escape(data.operator)} · <a href="mailto:${escape(data.email)}">${escape(data.email)}</a></p></div></footer></body></html>`;
  await writeFile(new URL(`${key}.html`,output),html);
}
console.log(`Public pages generated: ${fileURLToPath(output)}`);
