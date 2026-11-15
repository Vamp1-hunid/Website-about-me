// src/signup.js
// Checks used when someone creates an account, following common international practice:
//  - date of birth: 13 is the minimum age (COPPA in the US, GDPR and most other countries' rules);
//    13 to 17 year olds get a teen account with extra protection (see chat rules).
//  - country: an ISO 3166 two-letter code, so rules for that region can be applied later.
//  - passwords: NIST SP 800-63B style: long enough, not a well-known password, not the username.

const MIN_AGE = 13;
const ADULT_AGE = 18;
const TERMS_VERSION = "2026-11";

// A short list of the passwords people pick most often (they are guessed first in attacks).
const COMMON = new Set(("123456 1234567 12345678 123456789 1234567890 12345678910 password password1 password12 password123 " +
  "qwerty qwerty123 qwertyuiop 111111 000000 abc123 abcd1234 iloveyou iloveyou1 admin admin123 welcome welcome1 " +
  "letmein monkey dragon football baseball sunshine princess master shadow superman batman trustno1 starwars " +
  "passw0rd p@ssw0rd p@ssword 1q2w3e4r 1q2w3e4r5t zaq12wsx qazwsx asdfghjkl asdfgh 987654321 123123 123123123 " +
  "11111111 00000000 55555555 88888888 666666 121212 654321 secret secret123 changeme computer internet " +
  "naruto onepiece pokemon chapterhive godsbanditos zambia lusaka zambia123").split(" "));

function ageOn(birth, today) {
  today = today || new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

// "2008-05-17" -> { date, age } or { problem }
function checkBirthDate(value) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { problem: "Enter your date of birth." };
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (isNaN(date) || date.getUTCDate() !== Number(match[3]) || date.getUTCMonth() !== Number(match[2]) - 1) {
    return { problem: "That date doesn't exist." };
  }
  const age = ageOn(date);
  if (age < 0 || age > 120) return { problem: "Please check the year." };
  if (age < MIN_AGE) {
    return { problem: "You need to be at least " + MIN_AGE + " to create an account.", tooYoung: true };
  }
  return { date: match[0], age: age };
}

function checkCountry(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function passwordProblem(password, username) {
  if (typeof password !== "string" || password.length < 10) return "Use at least 10 characters. A short sentence works well.";
  if (password.length > 128) return "Use 128 characters or fewer.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common. Pick something only you would think of.";
  if (/^(.)\1+$/.test(password)) return "Don't repeat one character.";
  if (username && username.length >= 3 && lower.includes(username.toLowerCase())) return "Don't use your username in your password.";
  return null;
}

function isMinor(birthDate) {
  if (!birthDate) return null; // unknown
  const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
  return ageOn(d) < ADULT_AGE;
}

module.exports = { MIN_AGE, ADULT_AGE, TERMS_VERSION, checkBirthDate, checkCountry, passwordProblem, isMinor, ageOn };
