import dns from 'dns/promises';
import ip from 'ip';
import validator from 'validator';

export async function isSafeForFetching(input: string): Promise<boolean> {
  const trim = input.trim();
  const options = {
    protocols: ['https'],
    require_protocol: true
  };

  if (!validator.isURL(trim, options)) {
    console.log('Invalid URL: ', trim);
    return false;
  }

  const url = new URL(trim);
  if (validator.isIP(url.hostname)) {
    console.log('Not a hostname: ', url.hostname);
    return false;
  }

  if (!validator.isFQDN(url.hostname)) {
    console.log('Not a FQDN: ', url.hostname);
    return false;
  }

  try {
    const addresses = await dns.resolve(url.hostname);

    if (addresses.some((address) => ip.isPrivate(address))) {
      console.log('Private address: ', url.hostname, addresses);
      return false;
    }
  } catch (error) {
    console.error('DNS resolution failed:', error);
    return false;
  }

  return true;
}
