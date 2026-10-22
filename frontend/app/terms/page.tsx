import type {Metadata} from 'next';
import {PublicDocument} from '@/components/public-document';
export const metadata:Metadata={title:'Términos y condiciones',alternates:{canonical:'/terms'}};
export default function Terms(){return <PublicDocument page="terms"/>;}
