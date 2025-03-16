/**
 * Content script inserted onto each FA page. Handles filtering the data based on user input.
 */

const addRemoveHTML  = '<div class="filter-affinity-container"><div class="add" title="Add artist to filter">&#43;</div><div class="remove" title="Remove artist from filter">&#45;</div></div>';
const filterSelector = '.t-image, .t-text, .t-flash';
const descPopup = '#description_popup .wrapper';
const bannerSelector = '#fa_header, .sitebanner, .site-banner';
let galleryDivs = null;
let descriptions = null;

// Helper functions
function matches(el, selector) {
	if (!selector) return false;
	return (el.matches || el.matchesSelector || el.mozMatchesSelector || el.webkitMatchesSelector || el.oMatchesSelector).call(el, selector);
}

function findClosest(startEl, selector) {
	let el = startEl;
	while (el && !matches(el, selector)) {
		el = el.parentNode || null;
	}
	return el;
}

function sendMessage(message) {
	chrome.runtime.sendMessage(message, (error) => {
		if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
	});
}

// Base Functions
function filter( data ) {
	if( !data.hasOwnProperty( 'enabled' ) || !descriptions ) return;

	//Reset everything
	document.querySelector('body').classList.toggle('disable-fa', !data.enabled);
	galleryDivs.forEach(div => div.classList.remove('hide-thumb', 'hide-img'));
	document.querySelectorAll(bannerSelector).forEach(div => div.classList.remove('hide-banner'));

	//Exit out if not enabled
	if( !data.enabled ) return;

	//Toggle banner
	document.querySelectorAll(bannerSelector).forEach(div => div.classList.toggle('hide-banner', data.removeBanner));

	//Otherwise, continue to filter
	const filterClass = !!data.hideThumbs ? 'hide-thumb':'hide-img';
	let id = null;
	let galleryDivsSubset = [];
	let newGallerySubset = [];

	//Filter by ratings
	let ratings = data.ratings;
	ratings = ( ratings.length > 0 ) ? '.' + ratings.join( ', .' ) : '';

	galleryDivs.forEach((div) => {
		if (!matches(div, ratings)) {
			div.classList.add(filterClass);
		} else {
			galleryDivsSubset.push(div);
		}
	});

	//Filter by artist names
	if( data.blocklistArtists.length > 0 ) {
		galleryDivsSubset.forEach( (div) => {
			id = parseFloat(div.id.split('sid-')[1] );
			if (artistInList(id, data.blocklistArtists)) {
				div.classList.add(filterClass);
			} else {
				newGallerySubset.push(div);
			}
		});
		galleryDivsSubset = newGallerySubset;
	}

	//Filter by keywords
	if( data.blocklistKeywords.length > 0 ) {
		let regexArray = [];
		let tempVal = null;
		let regexTempArray = null;

		for( let i = 0; i < data.blocklistKeywords.length; i++ ) {
			regexTempArray = [];
			data.blocklistKeywords[ i ].split( ' ' ).forEach( function( val ) {
				tempVal = val.trim();
				if( tempVal.length > 0 ) regexTempArray.push( new RegExp( '\\b' + tempVal + '\\b', 'gi' ) );
			});
			regexArray.push( regexTempArray );
		}

		let text = null;
		let desc = null;
		let regexes = null;
		let matchFound = true;
		let j = null;

		//Filter by title/description
		galleryDivsSubset.forEach((div) => {
			id =  parseFloat(div.id.split('sid-')[1]);
			text = descriptions[ id ].title;
			desc = descriptions[ id ].description;

			for (let i = 0; i < regexArray.length; i++) {
				regexes = regexArray[i];
				j = regexes.length - 1;
				matchFound = true;

				while (matchFound === true && j >= 0) {
					matchFound = text.search(regexes[j]) >= 0 || desc.search(regexes[j]) >= 0;
					j--;
				}

				if (!matchFound) continue;
				else break;
			}

			if (matchFound) {
				div.classList.add(filterClass);
			}
		});
	}

	//Add back in artists
	if (data.allowlistArtists.length > 0) {
		galleryDivs.forEach((div) => {
			if (div.classList.contains(filterClass)) {
				id = parseFloat(div.id.split('sid-')[1]);
				if (artistInList(id, data.allowlistArtists)) {
					div.classList.remove(filterClass);
				}
			}
		});
	}
}

function artistInList(id, artistList) {
	let artistUsername = descriptions[id].lower.toLowerCase();
	let artistDisplayName = descriptions[id].username.toLowerCase();
	return artistList.includes(artistUsername) || artistList.includes(artistDisplayName);
}

function sortRequest( request, sender, resp ) {
	resp();
	switch ( request.action ) {
		case 'filter':
			filter( request.data );
			break;
	}
}

function bindEvents() {
	const body = document.querySelector('body');
	body.addEventListener('click', (e) => {
		const el = e.target;
		if (el.parentNode.classList.contains('filter-affinity-container')) {
			if (el.classList.contains('add')) {
				const id = findClosest(el, filterSelector).id.split('sid-')[1];
				const artistName = descriptions[id].lower;
				sendMessage( { type: 'addArtist', data: artistName } );
			} else if (el.classList.contains('remove')) {
				const id = findClosest(el, filterSelector).id.split('sid-')[1];
				const artistUsername = descriptions[id].lower;
				const artistDisplayName = descriptions[id].username;
				const artistNames = [ artistUsername, artistDisplayName];
				sendMessage({ type: 'removeArtist', data: artistNames.join() });
			}
		}
	});
}

// Build description info from data on the page
function buildDescription() {
	if (!galleryDivs.length) return;
	const newDesc = {};
	galleryDivs.forEach((div) => {
		const id = parseFloat(div.id.split('sid-')[1]);
		const links = div.querySelectorAll('figcaption a');
		newDesc[id] = {
			username: links[1].title, // Display Name
			// Grab username from URL: "https://www.furaffinity.net/user/sciggles/"
			// The title element now has a user's display name, which can vary.
			lower: getUsername(links[1].href),
			title: links[0].title,
			description: '',
		};
	});
	return newDesc;
}

function getUsername(artistUrl) {
	if (artistUrl === null || artistUrl === undefined || artistUrl.length <= 0) {
		return '';
	}
	let elements = artistUrl.split('/').filter(str => str.length > 0);
	return elements.length > 0 ? elements[elements.length - 1] : '';
}

function init() {
	galleryDivs = document.querySelectorAll(filterSelector);
	galleryDivs.forEach((div) => {
		div.insertAdjacentHTML('beforeend', addRemoveHTML);
	});

	bindEvents();

	let existingFADescriptionScriptDataElement = document.getElementById('js-submissionData');
	if (existingFADescriptionScriptDataElement === null || existingFADescriptionScriptDataElement.textContent.length <= 0) {
		descriptions = buildDescription();
		if (!descriptions) return;
	} else {
		descriptions = JSON.parse(existingFADescriptionScriptDataElement.textContent);
	}

	//Get filter data and actually filter
	sendMessage({ type: 'requestData' }, (error) => {
		if (error) console.log(error);
	});
}

chrome.runtime.onMessage.addListener( sortRequest );

init();
