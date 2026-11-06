/**
 * Entry point of the browser preview build (npm run preview:web).
 * metro.config.js points `expo-router/entry` here when SYNCSLATE_WEB_PREVIEW=1.
 */
import { registerRootComponent } from 'expo';

import { initWebAudioFiles } from '../services/audioFiles.web';
import { installPreviewDialogs } from './dialogs';
import PreviewApp from './PreviewApp';

installPreviewDialogs();
void initWebAudioFiles().finally(() => registerRootComponent(PreviewApp));
