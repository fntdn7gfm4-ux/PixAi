const [id, token] = location.hash.slice(1).split('/');
const returned = new URLSearchParams(location.search);
const suffix = ['transaction_nsu','invoice_slug'].map(key=>returned.get(key)?'&'+key+'='+encodeURIComponent(returned.get(key)):'').join('');
if (id && token)
  location.replace('./#real-result?op='+encodeURIComponent(id)+'&token='+encodeURIComponent(token)+suffix);
else location.replace('./');
