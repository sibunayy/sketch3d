// Builds index.html from src/. Usage: npm install && node build.mjs
import fs from 'fs';
const order='skin part2 sdf fix part3 presets features side sil ref ux ui3d part5'.split(' ');
const js=order.map(n=>fs.readFileSync(`src/${n}.js`,'utf8')).join('')+'init();\n';
// the original build used `cat` then `echo "init();"`, which adds the line after the last file
const three=fs.readFileSync('node_modules/three/build/three.min.js','utf8');
if(/<\/script/.test(three)||/<\/script/.test(js))throw new Error('</script found');
const html=fs.readFileSync('src/template.html','utf8');
fs.writeFileSync('index.html',html.replace('<!--THREE-->','<script>'+three+'</script>')+'<script>\n'+js+'\n</script>');
console.log('index.html',fs.statSync('index.html').size,'bytes');
