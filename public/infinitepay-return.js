const [id, token] = location.hash.slice(1).split('/');
if (id && token)
  location.replace('./#real-result?op='+encodeURIComponent(id)+'&token='+encodeURIComponent(token));
else location.replace('./');
