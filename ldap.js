// ldap.js
const ldap = require('ldapjs');

function LdapAuthenticator(url, baseDN, username, password) {
  return new Promise((resolve, reject) => {
    // Create a new LDAP client
    const client = ldap.createClient({
      url: url
    });
    client.on('error', e => console.log(e) );
    client.bind(`cn=${username},${baseDN}`, password, (err) => {
        client.unbind();
        if (err) {
            console.log("Bind failed: ", err)
            return reject(new Error(`Bind failed: ${err.message}`));
        }
            return resolve(true);
    });
  });
}

module.exports = LdapAuthenticator;
