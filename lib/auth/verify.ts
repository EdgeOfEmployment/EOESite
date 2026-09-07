interface ClaimsClient {
  auth: {
    getClaims: () => Promise<{ data: { claims: { sub: string } } | null }>
  }
}

// Verifies the caller's JWT locally via WebCrypto against the project's cached
// JWKS, so callers pay no Auth-server round trip. Requires asymmetric signing
// keys on the Supabase project; with a symmetric secret this silently falls
// back to a network call.
export async function getVerifiedUser(supabase: ClaimsClient): Promise<{ id: string } | null> {
  const { data } = await supabase.auth.getClaims()
  return data ? { id: data.claims.sub } : null
}
