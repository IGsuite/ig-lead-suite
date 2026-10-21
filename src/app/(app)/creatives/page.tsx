"use client";
import {Suspense} from "react";
import {LoadingPanel} from "@/components/state-panels";
import CreativesView from "./creatives-view.min.js";
export default function CreativesPage(){return <Suspense fallback={<LoadingPanel/>}><CreativesView/></Suspense>;}
