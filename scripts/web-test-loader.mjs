import * as moduleApi from 'node:module';

const hasNativeRegisterHooks = typeof moduleApi.registerHooks === 'function';
const assetPattern = /\.(?:css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|woff2?|ttf)(?:[?#].*)?$/i;
const assetUrlPrefix = 'dgbook-web-test-asset:';
const registerHooksCompatUrl = `data:text/javascript,${encodeURIComponent([
  "export * from 'node:module';",
  "export { default } from 'node:module';",
  'export function registerHooks() {',
  '  return Object.freeze({ deregister() {} });',
  '}',
].join('\n'))}`;

export async function resolve(specifier, context, nextResolve) {
  if (
    !hasNativeRegisterHooks
    && specifier === 'node:module'
    && context.parentURL !== registerHooksCompatUrl
  ) {
    return { url: registerHooksCompatUrl, shortCircuit: true };
  }

  if (assetPattern.test(specifier)) {
    return {
      url: `${assetUrlPrefix}${encodeURIComponent(specifier)}`,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith(assetUrlPrefix)) return nextLoad(url, context);

  const specifier = decodeURIComponent(url.slice(assetUrlPrefix.length));
  const isStyle = /\.(?:css|scss|sass|less)(?:[?#].*)?$/i.test(specifier);
  return {
    format: 'module',
    shortCircuit: true,
    source: isStyle
      ? 'export default Object.freeze({});'
      : `export default ${JSON.stringify(specifier)};`,
  };
}
