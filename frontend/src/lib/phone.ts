import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

const names=new Intl.DisplayNames(['es'],{type:'region'});
export const phoneCountries=getCountries().map(country=>({country,name:names.of(country)||country,dial:`+${getCountryCallingCode(country)}`})).sort((a,b)=>a.name.localeCompare(b.name,'es'));

export function internationalPhone(value:string,country:CountryCode) {
  if(!/^[+\d\s().-]+$/.test(value))return null;
  const parsed=parsePhoneNumberFromString(value,{defaultCountry:country,extract:false});
  if(!parsed?.isValid()||parsed.ext)return null;
  if(parsed.country!==country&&!parsed.getPossibleCountries().includes(country))return null;
  return parsed.number;
}
