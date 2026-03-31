"""
test_route53_tls.py — Integration tests for DNS resolution and TLS/HTTPS.

Tests:
  1. DNS resolves — the domain returns at least one A or CNAME record.
  2. HTTPS endpoint is reachable and returns HTTP 200 on /health.
  3. TLS certificate is valid (not expired, CN/SAN matches domain).
  4. TLS certificate expiry is >= 14 days away (early-warning canary).

Requires: APP_DOMAIN env var (e.g. skool.shopmultitouch.com)
"""

import datetime
import socket
import ssl

import dns.resolver
import pytest
import requests


# ---------------------------------------------------------------------------
# 1. DNS resolution
# ---------------------------------------------------------------------------
def test_dns_resolves(app_domain):
    """
    The domain must resolve to at least one IP address.
    Uses dnspython to query A records, then falls back to CNAME.
    Fails if neither record type exists — indicates a Route53 misconfiguration.
    """
    resolved = False

    for record_type in ("A", "CNAME"):
        try:
            answers = dns.resolver.resolve(app_domain, record_type)
            assert len(answers) > 0, f"Empty {record_type} answer for {app_domain}"
            resolved = True
            print(
                f"\n[dns] {app_domain} → {record_type}: "
                + ", ".join(str(r) for r in answers)
            )
            break
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            continue

    assert resolved, (
        f"DNS resolution failed for '{app_domain}': no A or CNAME records found. "
        "Check Route53 hosted zone and record configuration."
    )


# ---------------------------------------------------------------------------
# 2. HTTPS endpoint is reachable (HTTP 200)
# ---------------------------------------------------------------------------
def test_https_reachable(app_domain):
    """
    GET https://<domain>/health must return HTTP 200 within 15 seconds.
    Validates that the ALB, ASG, and domain routing are all functioning end-to-end.
    """
    url = f"https://{app_domain}/health"
    try:
        response = requests.get(url, timeout=15, allow_redirects=True)
    except requests.exceptions.ConnectionError as e:
        pytest.fail(f"Failed to connect to {url}: {e}")
    except requests.exceptions.Timeout:
        pytest.fail(f"Timeout (15s) reaching {url} — server may be unhealthy")

    assert response.status_code == 200, (
        f"Expected HTTP 200 from {url} but got {response.status_code}. "
        f"Response body: {response.text[:300]}"
    )


# ---------------------------------------------------------------------------
# 3. TLS certificate is valid
# ---------------------------------------------------------------------------
def test_tls_cert_valid(app_domain):
    """
    The TLS certificate served by the domain must:
      - Not be expired.
      - Have a Subject Alternative Name (SAN) or CN matching the domain.

    Uses Python's built-in ssl module — no external CA bundle needed in CI.
    """
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((app_domain, 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname=app_domain) as ssock:
                cert = ssock.getpeercert()
    except ssl.SSLCertVerificationError as e:
        pytest.fail(f"TLS certificate verification failed for {app_domain}: {e}")
    except (socket.timeout, ConnectionRefusedError) as e:
        pytest.fail(f"Could not establish TLS connection to {app_domain}:443 — {e}")

    # Check expiry
    not_after_str = cert.get("notAfter")
    assert not_after_str, "Certificate 'notAfter' field is missing"
    not_after = datetime.datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z")
    now = datetime.datetime.utcnow()
    assert not_after > now, (
        f"TLS certificate EXPIRED on {not_after_str}. "
        "Renew the ACM certificate immediately!"
    )

    # Check SAN / CN matches domain
    san_names = [
        name
        for san_type, name in cert.get("subjectAltName", [])
        if san_type == "DNS"
    ]
    cn_names = [
        val
        for rdn in cert.get("subject", [])
        for key, val in rdn
        if key == "commonName"
    ]
    all_names = san_names + cn_names

    domain_matched = any(
        app_domain == n or (n.startswith("*.") and app_domain.endswith(n[1:]))
        for n in all_names
    )
    assert domain_matched, (
        f"TLS certificate does not cover '{app_domain}'. "
        f"Certificate names: {all_names}"
    )


# ---------------------------------------------------------------------------
# 4. TLS certificate expiry warning (>= 14 days)
# ---------------------------------------------------------------------------
def test_tls_cert_expiry_warning(app_domain):
    """
    The TLS certificate must expire at least 14 days from now.
    This is an early-warning canary: even if the cert is technically valid
    today, catching near-expiry here fires before users see SSL errors.

    Threshold: 14 days — ACM auto-renews at 60 days, so hitting the 14-day
    gate means auto-renewal has silently failed and needs manual intervention.
    """
    WARN_DAYS = 14
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((app_domain, 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname=app_domain) as ssock:
                cert = ssock.getpeercert()
    except Exception as e:
        pytest.skip(f"Could not fetch cert for expiry check: {e}")

    not_after_str = cert.get("notAfter", "")
    if not not_after_str:
        pytest.skip("notAfter field missing from cert — skipping expiry warning")

    not_after = datetime.datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z")
    days_remaining = (not_after - datetime.datetime.utcnow()).days

    assert days_remaining >= WARN_DAYS, (
        f"⚠️  TLS certificate for '{app_domain}' expires in {days_remaining} day(s) "
        f"(on {not_after_str}). ACM auto-renewal may have failed — check ACM console!"
    )
    print(f"\n[tls] Certificate for {app_domain} expires in {days_remaining} day(s).")
