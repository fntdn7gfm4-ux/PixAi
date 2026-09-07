export function normalizeCPF(value) {
  return String(value ?? "").replace(/\D/g, "");
}
export function isValidCPF(value) {
  const cpf = normalizeCPF(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}
// Asaas returns the Pix key holder's document masked as ***.202.745-**
// (first 3 and last 2 digits hidden, middle 6 visible). Verified against
// docs.asaas.com/docs/consultar-chave-pix; re-check against a live sandbox
// response before go-live in case the mask format changes.
export function maskedCpfMatches(declaredCpf, maskedCpfCnpj) {
  const cpf = normalizeCPF(declaredCpf);
  if (cpf.length !== 11 || typeof maskedCpfCnpj !== "string") return false;
  const expected = `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
  return maskedCpfCnpj === expected;
}
