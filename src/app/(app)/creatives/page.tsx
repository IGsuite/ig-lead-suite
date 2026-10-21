"use client";
import {Suspense} from "react";
import {useSearchParams} from "next/navigation";
import {LoadingPanel} from "@/components/state-panels";
import CreativesView from "./creatives-view.min.js";
function ProgramLibrary(){const params=useSearchParams();return <CreativesView initialBrandId={params.get("brandId")} initialPrograms={params.getAll("program")}/>;}
export default function CreativesPage(){return <Suspense fallback={<LoadingPanel/>}><ProgramLibrary/></Suspense>;}
