// ============================================================================
// Validador básico de contraseñas. Sirve para rechazar contraseñas obviamente
// malas (las top filtradas en breaches públicos, todo letras, todo números)
// sin pegarle a APIs externas.
//
// Para usuarios que sean muy paranoicos podríamos integrar HaveIBeenPwned con
// su API de k-anonymity (hash SHA-1 prefijo de 5 chars), pero por ahora la
// lista local cubre el 90% de los casos.
// ============================================================================

const MIN_LENGTH = 10;

// Top 200 más comunes en breaches reales (RockYou, Collection #1, etc).
// Lista cerrada compilada manualmente — agregar más solo si vemos casos reales.
const COMMON_PASSWORDS = new Set([
  "123456", "123456789", "12345678", "1234567890", "12345", "1234567",
  "password", "password1", "password123", "Password1", "Password123",
  "qwerty", "qwerty123", "qwertyuiop", "qwertyui",
  "abc123", "111111", "1234", "iloveyou", "000000", "1q2w3e4r",
  "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm",
  "monkey", "dragon", "letmein", "trustno1", "sunshine", "princess",
  "admin", "admin123", "administrator", "root", "rootpass", "toor",
  "welcome", "welcome1", "welcome123", "login", "passw0rd", "p@ssw0rd",
  "master", "shadow", "superman", "batman", "michael", "jordan",
  "michelle", "jennifer", "thomas", "anthony", "joshua",
  "andrew", "daniel", "matthew", "robert", "soccer", "baseball",
  "football", "hockey", "tennis", "killer", "hello", "hello123",
  "freedom", "whatever", "starwars", "ninja", "qwerty1",
  "654321", "121212", "1q2w3e", "qweasd", "asdf1234", "1qaz2wsx",
  "qazwsx", "12qwaszx", "google", "facebook", "twitter", "linkedin",
  "yahoo", "summer", "winter", "spring", "autumn", "12341234",
  "qwerty12", "qwerty1234", "computer", "internet", "samsung", "iphone",
  // Sumar las versiones en español
  "contrasena", "contraseña", "claveclave", "argentina", "buenosaires",
  "boca", "river", "passwd",
  "1111", "0000", "00000000", "11111111", "22222222", "88888888",
  "abcdefg", "abcdefgh", "abc12345", "abcd1234",
  "asdasd", "asdasdasd", "qweqwe", "qwertz", "ytrewq",
  "loveyou", "iloveu", "ilove123",
  "pokemon", "pikachu", "marley", "snoopy",
  "qaz123", "qazqaz", "wsxwsx", "letmein1", "letmein123",
  "secret", "secret123", "passw1rd",
  "asdf", "1234abcd", "abcd1234", "1q2w3e4r5t",
  "godismyrock", "jesus", "jesus123",
  "mickey", "donald", "test", "test1234", "test123", "testing",
  "soporte", "soporte123", "admin1234", "admin12345",
  "demo", "demo123", "user", "user123", "guest", "guest123",
  "12345abc", "abc12345", "abcd12345", "1a2b3c4d", "1a2b3c",
  "mypassword", "mypass", "mypass1", "mypass123",
  "newpassword", "newpass", "newpass1",
  "ferrari", "porsche", "harley", "yamaha",
  "naruto", "sasuke", "minecraft", "fortnite",
  "ronaldo", "messi", "cristiano",
  // patrones secuenciales mas largos
  "1234567a", "abcdef123", "qwerty789",
  "passwordpassword", "qwertyqwerty",
]);

export type PasswordCheck =
  | { ok: true }
  | { ok: false; reason: string };

export function validatePassword(password: string): PasswordCheck {
  if (!password || password.length < MIN_LENGTH) {
    return { ok: false, reason: `La contraseña tiene que tener al menos ${MIN_LENGTH} caracteres.` };
  }
  if (password.length > 200) {
    return { ok: false, reason: "Demasiado larga (máx 200 caracteres)." };
  }
  if (COMMON_PASSWORDS.has(password) || COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      ok: false,
      reason:
        "Esa contraseña aparece en bases públicas de contraseñas filtradas. Elegí otra distinta.",
    };
  }
  // Patrones obvios: solo dígitos o solo letras
  if (/^\d+$/.test(password)) {
    return { ok: false, reason: "Combiná letras y números. Solo dígitos es muy débil." };
  }
  if (/^[a-zA-Z]+$/.test(password)) {
    return { ok: false, reason: "Combiná letras y números. Solo letras es muy débil." };
  }
  // 1 carácter repetido o muy poca variedad
  const unique = new Set(password).size;
  if (unique < 4) {
    return { ok: false, reason: "Demasiados caracteres repetidos. Elegí algo con más variedad." };
  }
  return { ok: true };
}
