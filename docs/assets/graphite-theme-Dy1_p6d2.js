import{i as e,n as t,s as n,t as r}from"./index-tJ_gkuAY.js";var i=r(),a=(0,i.jsxs)(`svg`,{width:`16`,height:`16`,viewBox:`0 0 16 16`,"aria-hidden":`true`,children:[(0,i.jsx)(`circle`,{cx:`8`,cy:`8`,r:`3`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`}),(0,i.jsx)(`path`,{d:`M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`})]}),o=(0,i.jsx)(`svg`,{width:`16`,height:`16`,viewBox:`0 0 16 16`,"aria-hidden":`true`,children:(0,i.jsx)(`path`,{d:`M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinejoin:`round`})}),s=[{id:`reit`,label:`REIT income`,route:`calc-reit-portfolio`},{id:`sip-swp`,label:`SIP & SWP`,route:`calc-sip-swp`}];function c({active:e,moduleLabel:n,theme:r,onToggleTheme:c,ticker:l}){return(0,i.jsxs)(`div`,{className:`sticky top-0 z-20`,style:{background:`var(--head)`,borderBottom:`1px solid var(--rule)`},children:[(0,i.jsxs)(`div`,{className:`flex h-[52px] items-center justify-between gap-4 px-4 sm:px-6`,children:[(0,i.jsxs)(`div`,{className:`flex min-w-0 items-center gap-3`,children:[(0,i.jsx)(`span`,{className:`h-5 w-5 flex-shrink-0 rounded-[5px]`,style:{background:`var(--accent)`},"aria-hidden":`true`}),(0,i.jsx)(`b`,{className:`text-[14.5px] font-semibold tracking-tight`,style:{color:`var(--ink)`},children:`FinCalc`}),(0,i.jsxs)(`span`,{className:`truncate text-[13px]`,style:{color:`var(--muted)`},children:[`/ `,n]})]}),(0,i.jsx)(`nav`,{"aria-label":`Modules`,className:`hidden gap-[22px] text-[12.5px] sm:flex`,children:s.map(n=>(0,i.jsx)(`button`,{type:`button`,onClick:()=>t(n.route),"aria-current":e===n.id?`page`:void 0,style:{color:e===n.id?`var(--ink)`:`var(--muted)`,fontWeight:e===n.id?600:400},children:n.label},n.id))}),(0,i.jsx)(`button`,{type:`button`,onClick:c,"aria-label":r===`dark`?`Switch to light theme`:`Switch to dark theme`,className:`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border`,style:{borderColor:`var(--rule)`,color:`var(--ink2)`},children:r===`dark`?a:o})]}),l&&(0,i.jsx)(`div`,{className:`flex h-9 items-center overflow-x-auto whitespace-nowrap`,style:{borderTop:`1px solid var(--rule)`,background:`var(--panel)`},children:l})]})}function l({children:e}){return(0,i.jsx)(`span`,{className:`flex-shrink-0 pl-4 pr-4 text-[10.5px] font-semibold uppercase tracking-[.1em]`,style:{color:`var(--muted)`},children:e})}function u({label:e,value:t,highlight:n}){return(0,i.jsxs)(`div`,{className:`flex items-baseline gap-[9px] border-l px-4 first:border-l-0`,style:{borderColor:`var(--rule)`},children:[(0,i.jsx)(`span`,{className:`text-[11.5px]`,style:{color:`var(--muted)`},children:e}),(0,i.jsx)(`b`,{className:`num text-[12px] font-medium`,style:{color:`var(--ink)`},children:t}),(0,i.jsx)(`i`,{className:`num text-[12px] font-medium not-italic`,style:{color:`var(--acctext)`},children:n})]})}var d=n(e(),1),f=`
.graphite {
  --paper:#F4F5F3; --panel:#F8F8F6; --rail:#FAFAF9; --sheet:#FFFFFF; --field:#FFFFFF; --head:#FFFFFF;
  --ink:#111418; --ink2:#343A42; --muted:#5A616B; --rule:#E1E3E0; --rule2:#C7CBC7;
  --accent:#D98A00; --acctext:#935C00; --onacc:#FFFFFF; --accent-soft:#FDF3E0;
  --warn:#B86A00; --warn-soft:#FCF1DE; --line2:#8A929E; --s3:#1F6FD1;
  --p1bg:#E3F1EB; --p1fg:#0B5A43; --p2bg:#E4EEFB; --p2fg:#1756A5; --p3bg:#FCEFD6; --p3fg:#7A4B00; --p4bg:#EEEFEC; --p4fg:#5A616B;
  background: var(--paper); color: var(--ink);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
}
.graphite .num { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
@media (prefers-color-scheme: dark) {
  .graphite:not([data-theme="light"]) {
    --paper:#0B0D10; --panel:#0F1216; --rail:#0D1013; --sheet:#12151A; --field:#0E1115; --head:#0B0D10;
    --ink:#ECEEF1; --ink2:#C3C9D1; --muted:#8C95A2; --rule:#232830; --rule2:#39414C;
    --accent:#F5A524; --acctext:#F5B547; --onacc:#1A1204; --accent-soft:#2A2210;
    --warn:#F5A524; --warn-soft:#2A2210; --line2:#7D8795; --s3:#5AB0FF;
    --p1bg:#1C2A25; --p1fg:#8FD9BE; --p2bg:#13263A; --p2fg:#8CC8FF; --p3bg:#34270C; --p3fg:#F5C46A; --p4bg:#1B1F26; --p4fg:#8C95A2;
  }
}
.graphite[data-theme="dark"] {
  --paper:#0B0D10; --panel:#0F1216; --rail:#0D1013; --sheet:#12151A; --field:#0E1115; --head:#0B0D10;
  --ink:#ECEEF1; --ink2:#C3C9D1; --muted:#8C95A2; --rule:#232830; --rule2:#39414C;
  --accent:#F5A524; --acctext:#F5B547; --onacc:#1A1204; --accent-soft:#2A2210;
  --warn:#F5A524; --warn-soft:#2A2210; --line2:#7D8795; --s3:#5AB0FF;
  --p1bg:#1C2A25; --p1fg:#8FD9BE; --p2bg:#13263A; --p2fg:#8CC8FF; --p3bg:#34270C; --p3fg:#F5C46A; --p4bg:#1B1F26; --p4fg:#8C95A2;
}
.graphite input[type=range] { accent-color: var(--accent); }
`,p=`fincalc-graphite-theme`;function m(){try{let e=localStorage.getItem(p);return e===`light`||e===`dark`?e:null}catch{return null}}function h(){let[e,t]=(0,d.useState)(()=>m()),[n,r]=(0,d.useState)(()=>typeof window<`u`&&window.matchMedia(`(prefers-color-scheme: dark)`).matches);(0,d.useEffect)(()=>{let e=window.matchMedia(`(prefers-color-scheme: dark)`),t=()=>r(e.matches);return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]);let i=e??(n?`dark`:`light`);function a(){let e=i===`dark`?`light`:`dark`;t(e);try{localStorage.setItem(p,e)}catch{}}return{theme:i,toggle:a}}function g(e){return e===`dark`?{line2:`#8A929E`,accent:`#F5A524`,s3:`#5AB0FF`,rule:`#232830`,ink2:`#C3C9D1`,paper:`#12151A`}:{line2:`#8A929E`,accent:`#D98A00`,s3:`#1F6FD1`,rule:`#E1E3E0`,ink2:`#343A42`,paper:`#FFFFFF`}}export{u as a,c as i,g as n,l as o,h as r,f as t};