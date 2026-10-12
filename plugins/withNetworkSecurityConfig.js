const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withNetworkSecurityConfig(config) {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }

      const xmlContent = '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<network-security-config>\n' +
        '    <base-config cleartextTrafficPermitted="true">\n' +
        '        <trust-anchors>\n' +
        '            <certificates src="system" />\n' +
        '            <certificates src="user" />\n' +
        '        </trust-anchors>\n' +
        '    </base-config>\n' +
        '    <domain-config cleartextTrafficPermitted="true">\n' +
        '        <domain includeSubdomains="true">sportsonnline.click</domain>\n' +
        '        <domain includeSubdomains="true">ww1.sportsonnline.click</domain>\n' +
        '        <domain includeSubdomains="true">dlstreams.st</domain>\n' +
        '        <domain includeSubdomains="true">dlhd.pk</domain>\n' +
        '        <domain includeSubdomains="true">lovetier.bz</domain>\n' +
        '        <domain includeSubdomains="true">streamic.st</domain>\n' +
        '        <domain includeSubdomains="true">direttecommunity.online</domain>\n' +
        '        <domain includeSubdomains="true">azione.direttecommunity.online</domain>\n' +
        '        <domain includeSubdomains="true">zicotv.cc</domain>\n' +
        '    </domain-config>\n' +
        '</network-security-config>';

      fs.writeFileSync(path.join(xmlDir, 'network_security_config.xml'), xmlContent);
      console.log('OK network_security_config.xml creato');
      return config;
    },
  ]);

  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
      app.$['android:usesCleartextTraffic'] = 'true';
      console.log('OK networkSecurityConfig registrato');
    }
    return config;
  });

  return config;
};
