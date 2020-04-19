import React, { Component, createRef } from "react";
import { Form, Button, Spin, InputNumber, List, Card, Select } from "antd";
import * as tf from "@tensorflow/tfjs";
import { AppstoreAddOutlined, CloseOutlined, ArrowLeftOutlined, ArrowRightOutlined, ArrowUpOutlined } from "@ant-design/icons";
import {
  layout,
  tailLayout,
  loadTruncatedMobileNet,
  ControllerDataset,
  sleep
} from "./unit";

let truncatedMobileNet, model;
const controllerDataset = new ControllerDataset();
const { Option } = Select;

let isBuildingExample = false;

export default class Ai extends Component {
  constructor(props) {
    super(props);
    this.state = {
      learnForm: {},
      exampleList: [],
      loading: false,
      training: false,
      isPredicting: false,
      isRecording: false,
      loss: 0,
      learnArgument: {
        learnRate: 0.001,
        batchSize: 0.4,
        epochs: 20,
        hiddenUnits: 100
      }
    };
    this.smallCanvasRef = createRef();
  }

  async componentDidMount() {
    this.setState({ loading: true });
    truncatedMobileNet = await loadTruncatedMobileNet();
    this.setState({ loading: false });
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      prevProps.action !== this.props.action &&
      this.state.isRecording &&
      !isBuildingExample
    ) {
      this.exampleHandler(this.props.action);
    }
  }

  exampleCleanHandler = async () => {
    this.setState({
      exampleList: []
    });
    controllerDataset.clean();
  };

  exampleHandler = async action => {
    isBuildingExample = true;
    const {
      state: { exampleList },
      props: { action: propAction, canvasRef }
    } = this;

    const img = tf.browser.fromPixels(canvasRef);
    const smallImg = img.resizeNearestNeighbor([224, 224]);
    const processedImg = tf.tidy(() =>
      smallImg
        .expandDims(0)
        .toFloat()
        .div(127)
        .sub(1)
    );
    const _action = action || propAction;
    const { speed, direction } = _action;
    console.log("example", _action);
    controllerDataset.addExample(truncatedMobileNet.predict(processedImg), [
      speed,
      direction
    ]);
    await tf.browser.toPixels(smallImg, this.smallCanvasRef.current);
    exampleList.push({
      img: this.smallCanvasRef.current.toDataURL(),
      action: { speed, direction }
    });
    this.setState({ exampleList });
    img.dispose();
    isBuildingExample = false;
  };

  train = async learnArgument => {
    this.setState({
      isTraining: true
    });
    console.log("Learnning Argument", learnArgument);
    if (controllerDataset.xs == null) {
      throw new Error("Add some examples before training!");
    }

    // Creates a 2-layer fully connected model. By creating a separate model,
    // rather than adding layers to the mobilenet model, we "freeze" the weights
    // of the mobilenet model, and only train weights from the new model.
    model = tf.sequential({
      layers: [
        // Flattens the input to a vector so we can use it in a dense layer. While
        // technically a layer, this only performs a reshape (and has no training
        // parameters).
        tf.layers.flatten({
          inputShape: truncatedMobileNet.outputs[0].shape.slice(1)
        }),
        // Layer 1.
        tf.layers.dense({
          units: learnArgument.hiddenUnits,
          activation: "relu",
          kernelInitializer: "varianceScaling",
          useBias: true
        }),
        // Layer 2. The number of units of the last layer should correspond
        // to the number of classes we want to predict.
        tf.layers.dense({
          units: 2,
          kernelInitializer: "varianceScaling",
          useBias: false,
          activation: "softmax"
        })
      ]
    });

    // Creates the optimizers which drives training of the model.
    const optimizer = tf.train.adam(learnArgument.learnRate);
    // We use categoricalCrossentropy which is the loss function we use for
    // categorical classification which measures the error between our predicted
    // probability distribution over classes (probability that an input is of each
    // class), versus the label (100% probability in the true class)>
    model.compile({ optimizer: optimizer, loss: "meanSquaredError" });

    // We parameterize batch size as a fraction of the entire dataset because the
    // number of examples that are collected depends on how many examples the user
    // collects. This allows us to have a flexible batch size.
    const batchSize = Math.floor(
      controllerDataset.xs.shape[0] * learnArgument.batchSize
    );
    if (!(batchSize > 0)) {
      throw new Error(
        `Batch size is 0 or NaN. Please choose a non-zero fraction.`
      );
    }

    // Train the model! Model.fit() will shuffle xs & ys so we don't have to.
    model.fit(controllerDataset.xs, controllerDataset.ys, {
      batchSize,
      epochs: learnArgument.epochs,
      callbacks: {
        onBatchEnd: async (batch, logs) => {
          console.log("Loss: " + logs.loss.toFixed(5));
          this.setState({ loss: logs.loss.toFixed(5) });
        },
        onTrainEnd: logs => {
          // const loss = logs.loss.toFixed(5);
          // console.log("Train End Loss: " + logs.loss.toFixed(5));
          this.setState({
            isTraining: false
            // loss
          });
        }
      }
    });
  };

  predict = async () => {
    const {
      props: { canvasRef, onAi }
    } = this;
    onAi(true);
    this.setState(
      {
        isPredicting: true
      },
      async () => {
        while (this.state.isPredicting) {
          await sleep(200);
          const img = tf.tidy(() =>
            tf.browser
              .fromPixels(canvasRef)
              .resizeNearestNeighbor([224, 224])
              .expandDims(0)
              .toFloat()
              .div(127)
              .sub(1)
          );

          // Make a prediction through mobilenet, getting the internal activation of
          // the mobilenet model, i.e., "embeddings" of the input images.
          const embeddings = truncatedMobileNet.predict(img);

          // Make a prediction through our newly-trained model using the embeddings
          // from mobilenet as input.
          const predictions = model.predict(embeddings);

          // Returns the index with the maximum probability. This number corresponds
          // to the class the model thinks is the most probable given the input.

          const [speed, direction] = await predictions.data();

          const action = {
            speed,
            direction
          };
          console.log("Ai 动作：", action);
          img.dispose();

          this.doAction(action);
          await tf.nextFrame();
        }
        onAi(false);
      }
    );
  };

  record = async () => {
    this.setState(
      {
        isRecording: true
      }
      // async () => {
      //   while (this.state.isRecording) {
      //     await this.exampleHandler();
      //     await sleep(1000);
      //   }
      // }
    );
  };

  async doAction({ speed, direction }) {
    const {
      props: { controller }
    } = this;
    controller.direction(direction);
    // controller.speed(speed);
  }

  render() {
    const {
      state: {
        exampleList,
        loading,
        isRecording,
        isTraining,
        isPredicting,
        loss,
        learnArgument
      },
      exampleHandler,
      exampleCleanHandler,
      record,
      predict
    } = this;

    return (
      <Spin spinning={loading}>
        <canvas className="ai-canvas" ref={this.smallCanvasRef}></canvas>
        <Form {...layout} initialValues={learnArgument} onFinish={this.train}>
          <Form.Item label="Learning rate" name="learnRate">
            <InputNumber />
          </Form.Item>
          <Form.Item label="Batch Size" name="batchSize">
            <Select>
              <Option value={0.05}>0.05</Option>
              <Option value={0.1}>0.1</Option>
              <Option value={0.4}>0.4</Option>
              <Option value={1}>1</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Epochs" name="epochs">
            <Select>
              <Option value={10}>10</Option>
              <Option value={20}>20</Option>
              <Option value={40}>40</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Hidden units" name="hiddenUnits">
            <Select>
              <Option value={100}>100</Option>
              <Option value={200}>200</Option>
              <Option value={300}>300</Option>
              <Option value={400}>400</Option>
              <Option value={500}>500</Option>
            </Select>
          </Form.Item>
          <Form.Item label="loss">
            <InputNumber value={loss} />
          </Form.Item>
          <Form.Item {...tailLayout}>
            <Button
              type="primary"
              htmlType="submit"
              key="fit"
              loading={isTraining}
              disabled={!exampleList.length}
            >
              学习
            </Button>
          </Form.Item>
        </Form>
        <Form
          {...layout}
          initialValues={{ speed: 0, direction: 0 }}
          onFinish={action => exampleHandler(action)}
        >
          <Form.Item name="speed" label="速度" required>
            <InputNumber />
          </Form.Item>
          <Form.Item name="direction" label="方向" required>
            <InputNumber />
          </Form.Item>
          <Form.Item {...tailLayout} className="form-item-button">
            <Button
              key="record-once"
              htmlType="submit"
              type="primary"
              icon={<AppstoreAddOutlined />}
            />
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => exampleHandler({ speed: 1, direction: 1 })}
            />
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={() => exampleHandler({ speed: 1, direction: -1 })}
            />
            <Button
              type="primary"
              icon={<ArrowUpOutlined />}
              onClick={() => exampleHandler({ speed: 1, direction: 0 })}
            />
            <Button
              type="primary"
              key="record"
              loading={isRecording}
              onClick={record}
            >
              开始记录
            </Button>
            <Button
              key="stop"
              onClick={() => {
                this.setState({ isRecording: false });
              }}
              disabled={!isRecording}
            >
              停止记录
            </Button>
            <Button
              type="danger"
              disabled={!exampleList.length}
              onClick={exampleCleanHandler}
            >
              清除
            </Button>
          </Form.Item>
          <Form.Item {...tailLayout} className="form-item-button">
            <Button
              type="danger"
              key="predic"
              loading={isPredicting}
              onClick={predict}
            >
              开始 Ai 驾驶
            </Button>
            <Button
              onClick={() => {
                this.setState({ isPredicting: false });
              }}
              disabled={!isPredicting}
              key="stop"
            >
              停止 Ai 驾驶
            </Button>
          </Form.Item>
        </Form>
        <List
          size="small"
          className="ai-example-list"
          grid={{ gutter: 16, column: 4 }}
          itemLayout="vertical"
          pagination={{
            pageSize: 12
          }}
          dataSource={exampleList}
          renderItem={({ img, action: { speed, direction } }) => (
            <List.Item>
              <Card
                size="small"
                title={`速度：${speed}    方向：${direction}`}
                actions={[
                  <Button size="small" icon={<CloseOutlined />} type="danger" />
                ]}
              >
                <img style={{ maxWidth: "100%" }} src={img} alt="example" />
              </Card>
            </List.Item>
          )}
        />
      </Spin>
    );
  }
}