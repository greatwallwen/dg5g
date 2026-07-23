#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const schemaRoot = 'schemas';
const exampleRoots = ['templates'];
const requiredSchemas = [
  'schemas/lesson/v1.schema.json',
  'schemas/assets/animation.v1.schema.json',
  'schemas/assets/narration.v1.schema.json',
  'schemas/assets/text.v1.schema.json',
  'schemas/assets/graphics.v1.schema.json',
  'schemas/assets/video.v1.schema.json',
  'schemas/assets/manim-animation.v1.schema.json',
  'schemas/templates/knowledge-animation-template.v1.schema.json',
];
const requiredDesignDocs = [
  'docs/design/image2/README.md',
  'docs/asset-spec.md',
];
const requiredExamples = [
  ['templates/lesson/minimal-lesson.yaml', 'dgbook.lesson/v1'],
  ['templates/animation/5g-knowledge-animation-template.yaml', 'dgbook.template.knowledge-animation/v1'],
];

const diagnostics = [];
const schemaContracts = new Map();
const schemaIds = new Map();

for (const file of requiredSchemas) await checkFileExists(file);
for (const file of await listFiles(path.join(root, schemaRoot))) {
  if (!file.endsWith('.json')) continue;
  await checkJsonSchema(path.relative(root, file).replaceAll(path.sep, '/'));
}
for (const [file, schemaId] of requiredExamples) await checkYamlHeader(file, schemaId);
for (const file of await listYamlFiles(exampleRoots)) {
  await checkYamlHeader(file);
}
for (const file of requiredDesignDocs) {
  await checkFileExists(file);
  await checkReadmeIndex('README.md', file);
}
await checkMarkdownLineLimits('docs/design', 300);

if (diagnostics.length) {
  for (const item of diagnostics) console.error(`${item.level.toUpperCase()} ${item.code}: ${item.message}`);
  process.exitCode = diagnostics.some((item) => item.level === 'error') ? 1 : 0;
} else {
  console.log('Architecture contracts validated.');
}

async function checkJsonSchema(file) {
  const text = await readText(file);
  if (!text) return;
  let schema;
  try {
    schema = JSON.parse(text);
  } catch (error) {
    add('error', 'schema-json-invalid', `${file}: ${error.message}`);
    return;
  }
  if (!schema.$schema) add('error', 'schema-meta-missing', `${file}: missing $schema`);
  if (typeof schema.$id !== 'string' || !schema.$id.trim()) {
    add('error', 'schema-id-missing', `${file}: missing non-empty $id`);
  } else if (schemaIds.has(schema.$id)) {
    add('error', 'schema-id-duplicate', `${file}: duplicate $id ${schema.$id} also used by ${schemaIds.get(schema.$id)}`);
  } else {
    schemaIds.set(schema.$id, file);
  }
  if (schema.type !== 'object') add('error', 'schema-type-invalid', `${file}: top-level type must be object`);
  if (!Array.isArray(schema.required) || !schema.required.length) {
    add('error', 'schema-required-missing', `${file}: missing non-empty required[]`);
  } else {
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    for (const item of schema.required) {
      if (typeof item !== 'string' || !item.trim()) {
        add('error', 'schema-required-invalid', `${file}: required[] entries must be non-empty strings`);
      } else if (!Object.hasOwn(properties, item)) {
        add('error', 'schema-required-property-missing', `${file}: required field "${item}" is not defined in properties`);
      }
    }
  }
  const schemaField = schema.properties?.schema;
  const schemaConst = schemaField && typeof schemaField === 'object' ? schemaField.const : undefined;
  if (typeof schemaConst !== 'string' || !schemaConst.trim()) {
    add('error', 'schema-field-const-missing', `${file}: properties.schema.const must declare the document schema id`);
    return;
  }
  if (!schema.required?.includes('schema')) {
    add('error', 'schema-field-not-required', `${file}: required[] must include schema`);
  }
  const expectedJsonSchemaId = schemaConst.replace('/', '.');
  if (schema.$id && schema.$id !== expectedJsonSchemaId) {
    add('error', 'schema-id-const-mismatch', `${file}: $id ${schema.$id} should match schema const ${schemaConst} as ${expectedJsonSchemaId}`);
  }
  if (schemaContracts.has(schemaConst)) {
    add('error', 'schema-const-duplicate', `${file}: duplicate schema const ${schemaConst} also used by ${schemaContracts.get(schemaConst)}`);
  } else {
    schemaContracts.set(schemaConst, file);
  }
}

async function checkYamlHeader(file, expectedSchema = undefined) {
  const text = await readText(file);
  if (!text) return;
  const match = /^schema:\s*([^\r\n]+)/m.exec(text);
  if (!match) {
    add('error', 'example-schema-missing', `${file}: missing schema field`);
    return;
  }
  if (expectedSchema && match[1].trim() !== expectedSchema) {
    add('error', 'example-schema-mismatch', `${file}: expected ${expectedSchema}, got ${match[1].trim()}`);
  }
  const actualSchema = match[1].trim();
  if (!schemaContracts.has(actualSchema)) {
    add('error', 'example-schema-unknown', `${file}: schema ${actualSchema} does not match any schemas/*.json properties.schema.const`);
  }
}

async function checkFileExists(file) {
  try {
    await access(path.join(root, file));
  } catch (error) {
    add('error', 'file-missing', `${file}: ${error.message}`);
  }
}

async function checkReadmeIndex(readme, indexedFile) {
  const text = await readText(readme);
  if (!text) return;
  if (!text.includes(indexedFile)) {
    add('error', 'docs-readme-index-missing', `${readme}: missing index entry for ${indexedFile}`);
  }
}

async function checkMarkdownLineLimits(dir, limit) {
  for (const file of await listFiles(path.join(root, dir))) {
    if (!file.endsWith('.md')) continue;
    const text = await readFile(file, 'utf-8');
    const lines = text.split(/\r?\n/).length;
    if (lines > limit) add('error', 'markdown-too-long', `${path.relative(root, file)} has ${lines} lines`);
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full));
    else files.push(full);
  }
  return files;
}

async function listYamlFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    for (const file of await listFiles(path.join(root, dir))) {
      if (/\.(ya?ml)$/i.test(file)) files.push(path.relative(root, file).replaceAll(path.sep, '/'));
    }
  }
  return files;
}

async function readText(file) {
  try {
    return await readFile(path.join(root, file), 'utf-8');
  } catch (error) {
    add('error', 'file-missing', `${file}: ${error.message}`);
    return '';
  }
}

function add(level, code, message) {
  diagnostics.push({ level, code, message });
}
