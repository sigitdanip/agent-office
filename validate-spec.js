const yaml = require('js-yaml');
const fs = require('fs');
try {
  const raw = fs.readFileSync('docs/heartbeat-api-v1.1.yaml', 'utf-8');
  const spec = yaml.load(raw);
  console.log('OpenAPI version:', spec.openapi);
  console.log('Title:', spec.info.title);
  console.log('Paths:', Object.keys(spec.paths).join(', '));
  console.log('Components schemas:', Object.keys(spec.components.schemas).length);

  const hbPath = spec.paths['/api/agents/{profileId}/heartbeat'];
  console.log('Heartbeat method:', Object.keys(hbPath)[0]);
  const schema = hbPath.post.requestBody.content['application/json'].schema;
  console.log('Required fields:', schema.required.join(', '));
  const optCount = Object.keys(schema.properties).length - schema.required.length;
  console.log('Optional fields count:', optCount);

  // Check snapshot response schema
  const snapResp = spec.paths['/api/snapshot'].get.responses['200'];
  console.log('Snapshot response ref:', snapResp.content['application/json'].schema['$ref'] || 'inline');

  console.log('\nVALID: true');
} catch(e) {
  console.error('VALIDATION FAILED:', e.message);
  process.exit(1);
}
