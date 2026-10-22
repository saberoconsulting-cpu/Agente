import {isSupportedCountry,parsePhoneNumberFromString,type CountryCode} from 'libphonenumber-js/max';

export function accessRequestPhone(value:string,selected?:unknown) {
  if(!/^[+\d\s().-]+$/.test(value))throw new Error('Invalid phone');
  if(selected!==undefined&&(typeof selected!=='string'||!isSupportedCountry(selected)))throw new Error('Invalid country');
  const country=selected as CountryCode|undefined;
  if(!country&&!value.trim().startsWith('+'))throw new Error('International phone required');
  const parsed=parsePhoneNumberFromString(value,{defaultCountry:country,extract:false});
  if(!parsed?.isValid()||parsed.ext||(country&&parsed.country!==country&&!parsed.getPossibleCountries().includes(country)))throw new Error('Phone does not match country');
  return {phone:parsed.number,phone_country:country||parsed.country};
}
