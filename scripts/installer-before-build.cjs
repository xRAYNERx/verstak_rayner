/** @returns {Promise<false>} skip node_modules install/copy for the installer app */
module.exports = async function installerBeforeBuild() {
  return false
}