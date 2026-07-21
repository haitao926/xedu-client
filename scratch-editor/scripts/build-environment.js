function isDebugBuild(value) {
  return /^(1|true)$/i.test(String(value || '').trim());
}

module.exports = {isDebugBuild};
