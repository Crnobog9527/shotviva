// For scripts that import site content under tsx: components pulled in through the content
// modules import their CSS, which Node can't load. Nothing in a script needs it.
require.extensions['.css'] = () => {}
