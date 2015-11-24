/*global $:true*/

export function createElement(text, index, total, changed, isReference, isCandidate) {
    let markup = [
        '<div class="roadmap-item clearfix ' + (isCandidate ? 'roadmap-item-candidate' : '') + '"' +
        (!isReference ? 'id="roadmap_item_' + index + '"' : '') + '  draggable="true">',
        '<div>'
    ];

    if (!isReference) {
        markup.push('<span class="roadmap-item-grab-handle glyphicon glyphicon-move"></span>');
    }

    markup.push('<span class="roadmap-item-name"></span>');

    if (!isReference) {
        let isNotLast = total && total - 1 !== index;
        markup = markup.concat([
            '<span class="roadmap-author"></span>',
            isNotLast ? '<a href="#" class="roadmap-item-down">' : '',
            isNotLast ? '<span class="glyphicon glyphicon-arrow-down" aria-hidden="true"></span>' : '',
            isNotLast ? '</a>' : '',
            index ? '<a href="#" class="roadmap-item-up">' : '',
            index ? '<span class="glyphicon glyphicon-arrow-up" aria-hidden="true"></span>' : '',
            index ? '</a>' : '',
            '<a href="#" class="roadmap-item-delete">',
            '<span class="glyphicon glyphicon-trash" aria-hidden="true"></span>',
            '</a>'
        ]);
    }

    markup.push('</div></div>');

    let $element = $(markup.join(''));
    $element.data('index', index);
    $element.find('.roadmap-item-name').text(text);
    $element.attr('title', text);
    if (changed) {
        $element.addClass('roadmap-item-new');
    }
    return $element;
}

var storeView = [];
var thresholdMarkup = '<h5>Candidates</h5>';

export function renderRoadmap(store, thresholdValue) {
    let $elementContainer = $('#roadmap_items');
    let newStoreView = [];
    let nbItems = store.length;
    $elementContainer.html('');
    if (nbItems) {
        $('#roadmap_items_tips').addClass('hidden');
        store.forEach(function(text, index) {
            if (thresholdValue && index === thresholdValue) {
                $elementContainer.append(thresholdMarkup);
            }
            $elementContainer.append(createElement(text, index, nbItems, storeView[index] !== text, false, index >= thresholdValue));
            newStoreView[index] = text;
        });
        // add last element for DnD
        $elementContainer.append('<div class="roadmap-item clearfix"></div>');
    } else {
        $('#roadmap_items_tips').removeClass('hidden');
    }
    // keep a copy for the view
    storeView = newStoreView;
}

export function renderReference(storeReference, thresholdValue) {
    let $elementContainer = $('#reference_items');
    $elementContainer.html('');
    storeReference.forEach(function(text, index) {
        if (thresholdValue && index === thresholdValue) {
            $elementContainer.append(thresholdMarkup);
        }
        $elementContainer.append(createElement(text, index, null, true, true, index >= thresholdValue));
    });
}

export function displayOnline(online) {
    let $online = $('#online');
    $online.html('');
    for (let key in online) {
        if (online[key]) {
            $online.append(`<li id="user_${key}">${key}</li>`);
        }
    }
}

export function renderActionNotification(index, event) {
    let $item = $('#roadmap_item_' + index + ' > div');
    $item.removeClass('roadmap-item-notif-up, roadmap-item-notif-down');
    $('.roadmap-author', $item)
        .text(event.visa)
        .removeClass('roadmap-author-new');
    setTimeout(function() {
        $item.addClass('roadmap-item-notif-' + (event.direction < 0 ? 'up' : 'down'));
        $('.roadmap-author', $item)
            .addClass('roadmap-author-new');
    }, 10);
}