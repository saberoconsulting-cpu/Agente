import type {Metadata} from 'next';
import {PublicDocument} from '@/components/public-document';
export const metadata:Metadata={title:'La aplicación',alternates:{canonical:'/about'}};
export default function About(){return <PublicDocument page="about"/>;}
