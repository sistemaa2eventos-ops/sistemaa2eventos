const fs = require('fs');
const file = 'src/components/layout/Sidebar.jsx';
let text = fs.readFileSync(file, 'utf8');
text = text.replace(/roles: \['master'\]/g, "roles: ['master', 'admin_master']");
fs.writeFileSync(file, text);
console.log('Fixed Sidebar roles!');
