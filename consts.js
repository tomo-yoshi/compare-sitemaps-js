"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.URL_PAIRS = exports.KEYWORDS = exports.ALLOWED_ORIGINS = void 0;
exports.ALLOWED_ORIGINS = [
    'https://api.github.com',
];
exports.KEYWORDS = ['tommy', 'compare', 'sitemap'];
// Key should be a production(base) URL while a value should be a keyword included in a preview URL
exports.URL_PAIRS = {
    'https://canadiantrainvacations.com': 'canadiantrainvacations',
    'https://canadapolarbears.com': 'canadapolarbears',
    'https://northernlightscanada.com': 'northernlightscanada',
    'https://freshtrackscanada.com': 'freshtrackscanada'
};
