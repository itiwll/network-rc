import React, { useState } from "react";
import Joystick from "./Joystick";
import Camera from "./Camera";
import { Rnd } from "react-rnd";
import store from "store";
import { useEventListener, useMount, useUpdateEffect } from "@umijs/hooks";
import "./ControlUI.scss";
import classnames from "classnames";

const screenDirction = window.matchMedia("(orientation: portrait)");
export default function ControlUI({
  uiComponentList = [],
  channelList,
  changeChannel = function () {},
  editabled,
  cameraList,
  setting,
}) {
  const [orientation, setOrientation] = useState(
    screenDirction.matches ? "portrait" : "landscape"
  );

  const [positionMap, setPositionMap] = useState({});

  const savePosition = (id, position) => {
    if (!positionMap[id]) {
      positionMap[id] = {};
    }
    positionMap[id][orientation] = position;
    setPositionMap({ ...positionMap });
  };

  useUpdateEffect(() => {
    if (!editabled) {
      store.set("ui-position", positionMap);
    }
  }, [editabled, positionMap]);

  useMount(() => {
    setPositionMap(store.get("ui-position") || {});
  });

  useEventListener(
    "change",
    ({ matches }) => {
      setOrientation(matches ? "portrait" : "landscape");
    },
    {
      dom: screenDirction,
    }
  );

  const onControl = (id, v) => {
    channelList.forEach(({ enabled, ui, pin }) => {
      if (!enabled) return;
      ui.forEach(({ id: cId, positive, axis }) => {
        if (id === cId) {
          changeChannel({ pin, value: positive ? v[axis] : -v[axis] });
        }
      });
    });
  };

  const list = [
    ...cameraList.map((i) => {
      i.id = `camera-${i.cameraIndex}`;
      i.type = "camera";
      i.cameraIndex = i.index;
      i.enabled = true;
      return i;
    }),
    ...uiComponentList,
  ];

  return (
    <>
      {list.map(
        ({ id, name, enabled, type, audtoReset, cameraIndex }, index) => {
          const position = positionMap[id]?.[orientation] || {
            x: index * 50,
            y: index * 20,
            z: positionMap[id]?.[orientation]?.z || index + 2,
            size: undefined,
            ratio: undefined,
          };

          const { size, z, x, y, ratio } = position;

          return enabled ? (
            <Rnd
              key={id}
              disableDragging={!editabled}
              className={classnames("ui-rnd", {
                disabled: !editabled,
                resized: position.size,
              })}
              lockAspectRatio={ratio === undefined ? true : ratio}
              position={position}
              size={size}
              onDragStop={(_, { x, y }) => {
                savePosition(id, { x, y, z, size, ratio });
              }}
              onResizeStop={(e, direction, ref, delta, { x, y }) => {
                const size = {
                  width: ref.offsetWidth,
                  height: ref.offsetHeight,
                };
                savePosition(id, { x, y, z, size, ratio });
              }}
              style={{ zIndex: positionMap[id]?.[orientation]?.z || index + 2 }}
            >
              {type === "joystick" ? (
                <Joystick
                  disabled={editabled}
                  name={name}
                  onChange={(v) => onControl(id, v)}
                  audoReset={audtoReset}
                />
              ) : type === "camera" ? (
                <Camera
                  editabled={editabled}
                  key={cameraIndex}
                  index={cameraIndex}
                  url={`${setting.wsAddress}/video${cameraIndex}`}
                  onChangeVideoRatio={(ratio) =>
                    savePosition(id, { x, y, z, size, ratio })
                  }
                  onClickFullScreen={() => {}}
                  onClickCoverScreen={() => {}}
                  size={size}
                />
              ) : undefined}
            </Rnd>
          ) : undefined;
        }
      )}
    </>
  );
}
